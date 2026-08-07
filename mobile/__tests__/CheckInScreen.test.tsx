jest.mock('react-native-maps', () => {
  const React = require('react');
  const { View } = require('react-native');

  return {
    __esModule: true,
    default: ({ children, ...props }: { children?: React.ReactNode }) => (
      <View testID="check-in-map" {...props}>{children}</View>
    ),
    Marker: (props: object) => <View testID="check-in-map-pin" {...props} />,
    Circle: (props: object) => <View testID="check-in-accuracy-circle" {...props} />,
  };
});

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { CheckInScreen } from '../src/features/check-in/CheckInScreen';
import type { CheckIn, CheckInRepository, LocationFix, LocationGateway } from '../src/features/check-in/domain';

const fix: LocationFix = {
  latitude: 37.5445,
  longitude: 127.056,
  accuracyM: 42,
  capturedAt: '2026-08-06T00:00:00.000Z',
};

class FakeLocationGateway implements LocationGateway {
  constructor(
    private permission: 'granted' | 'denied' = 'granted',
    private nextFix: LocationFix | Error = fix,
  ) {}

  async requestForegroundPermission(): Promise<'granted' | 'denied'> {
    return this.permission;
  }

  async getCurrentFix(): Promise<LocationFix> {
    if (this.nextFix instanceof Error) throw this.nextFix;
    return this.nextFix;
  }
}

class FakeCheckInRepository implements CheckInRepository {
  saved: CheckIn[] = [];

  async save(checkIn: CheckIn): Promise<void> {
    this.saved.push(checkIn);
  }

  async listByLocalDay(): Promise<CheckIn[]> {
    return [];
  }

  async deleteById(): Promise<void> {}
}

class RejectOnceCheckInRepository extends FakeCheckInRepository {
  attempted: CheckIn[] = [];

  async save(checkIn: CheckIn): Promise<void> {
    this.attempted.push(checkIn);
    if (this.attempted.length === 1) throw new Error('저장 공간을 사용할 수 없어요.');
    await super.save(checkIn);
  }
}

class CountingLocationGateway implements LocationGateway {
  calls = 0;

  async requestForegroundPermission(): Promise<'granted'> {
    return 'granted';
  }

  async getCurrentFix(): Promise<LocationFix> {
    this.calls += 1;
    return this.calls === 1 ? fix : { ...fix, accuracyM: 18 };
  }
}

async function renderScreen(
  locationGateway: LocationGateway = new FakeLocationGateway(),
  repository = new FakeCheckInRepository(),
  onViewToday = jest.fn(),
) {
  const view = await render(
    <CheckInScreen
      deps={{
        locationGateway,
        repository,
        uuid: () => '11111111-1111-4111-8111-111111111111',
        now: () => '2026-08-06T00:00:03.000Z',
      }}
      onViewToday={onViewToday}
    />,
  );
  return { onViewToday, repository, view };
}

describe('CheckInScreen', () => {
  it('shows 현재 위치 확인 중 and no enabled save button while locating', async () => {
    let resolvePermission!: (permission: 'granted' | 'denied') => void;
    const locationGateway: LocationGateway = {
      requestForegroundPermission: () => new Promise((resolve) => { resolvePermission = resolve; }),
      getCurrentFix: async () => fix,
    };

    const view = await renderScreen(locationGateway);

    expect(view.view.getByText('현재 위치 확인 중')).toBeTruthy();
    expect(view.view.queryByRole('button', { name: '이 위치에 체크인' })).toBeNull();

    await act(async () => { resolvePermission('granted'); });
  });

  it('shows a map pin, 정확도 약 42m, 다시 찾기, and 이 위치에 체크인 when ready', async () => {
    await renderScreen();

    await waitFor(() => expect(screen.getByTestId('check-in-map-pin')).toBeTruthy());

    expect(screen.getByTestId('check-in-map-pin').props.draggable).toBe(false);
    expect(screen.getByTestId('check-in-accuracy-circle').props.radius).toBe(42);
    expect(screen.getByText('정확도 약 42m')).toBeTruthy();
    expect(screen.getByRole('button', { name: '다시 찾기' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '이 위치에 체크인' })).toBeTruthy();
  });

  it('does not save until 이 위치에 체크인 is pressed', async () => {
    const { repository } = await renderScreen();

    await waitFor(() => expect(screen.getByRole('button', { name: '이 위치에 체크인' })).toBeTruthy());
    expect(repository.saved).toEqual([]);

    await act(async () => {
      await fireEvent.press(screen.getByRole('button', { name: '이 위치에 체크인' }));
      await Promise.resolve();
      await Promise.resolve();
    });

    await waitFor(() => expect(repository.saved).toHaveLength(1));
  });

  it('does not save when 다시 찾기 refreshes the location', async () => {
    const locationGateway = new CountingLocationGateway();
    const repository = new FakeCheckInRepository();
    await renderScreen(locationGateway, repository);

    await waitFor(() => expect(screen.getByText('정확도 약 42m')).toBeTruthy());
    await act(async () => {
      await fireEvent.press(screen.getByRole('button', { name: '다시 찾기' }));
      await Promise.resolve();
      await Promise.resolve();
    });

    await waitFor(() => expect(screen.getByText('정확도 약 18m')).toBeTruthy());
    expect(locationGateway.calls).toBe(2);
    expect(repository.saved).toEqual([]);
  });

  it('saves once when 이 위치에 체크인 receives two presses', async () => {
    const { repository } = await renderScreen();

    await waitFor(() => expect(screen.getByRole('button', { name: '이 위치에 체크인' })).toBeTruthy());
    await act(async () => {
      await fireEvent.press(screen.getByRole('button', { name: '이 위치에 체크인' }));
      await fireEvent.press(screen.getByRole('button', { name: '이 위치에 체크인' }));
      await Promise.resolve();
      await Promise.resolve();
    });

    await waitFor(() => expect(screen.getByText('완료')).toBeTruthy());
    expect(repository.saved).toHaveLength(1);
  });

  it('retries a failed local save with the same fix and persists it once', async () => {
    const repository = new RejectOnceCheckInRepository();
    await renderScreen(new FakeLocationGateway(), repository);

    await waitFor(() => expect(screen.getByRole('button', { name: '이 위치에 체크인' })).toBeTruthy());
    await act(async () => {
      await fireEvent.press(screen.getByRole('button', { name: '이 위치에 체크인' }));
      await Promise.resolve();
      await Promise.resolve();
    });

    await waitFor(() => expect(screen.getByRole('button', { name: '이 위치에 다시 체크인' })).toBeTruthy());
    await act(async () => {
      await fireEvent.press(screen.getByRole('button', { name: '이 위치에 다시 체크인' }));
      await Promise.resolve();
      await Promise.resolve();
    });

    await waitFor(() => expect(screen.getByText('완료')).toBeTruthy());
    expect(repository.saved).toHaveLength(1);
    expect(repository.attempted).toHaveLength(2);
    expect(repository.attempted[1]).toEqual(repository.attempted[0]);
  });

  it('shows settings guidance after permission denial', async () => {
    await renderScreen(new FakeLocationGateway('denied'));

    await waitFor(() => expect(screen.getByText(/설정.*위치 권한/)).toBeTruthy());
  });

  it('shows retry after location failure', async () => {
    await renderScreen(new FakeLocationGateway('granted', new Error('GPS unavailable')));

    await waitFor(() => expect(screen.getByRole('button', { name: '다시 시도' })).toBeTruthy());
  });

  it('shows 완료 and 오늘의 발자국 보기 after local save', async () => {
    await renderScreen();

    await waitFor(() => expect(screen.getByRole('button', { name: '이 위치에 체크인' })).toBeTruthy());
    await act(async () => {
      await fireEvent.press(screen.getByRole('button', { name: '이 위치에 체크인' }));
      await Promise.resolve();
      await Promise.resolve();
    });

    await waitFor(() => expect(screen.getByText('완료')).toBeTruthy());
    expect(screen.getByRole('button', { name: '오늘의 발자국 보기' })).toBeTruthy();
  });

  it('opens 오늘의 발자국 exactly once only after its completion button is pressed', async () => {
    const onViewToday = jest.fn();
    await renderScreen(new FakeLocationGateway(), new FakeCheckInRepository(), onViewToday);

    await waitFor(() => expect(screen.getByRole('button', { name: '이 위치에 체크인' })).toBeTruthy());
    await act(async () => {
      await fireEvent.press(screen.getByRole('button', { name: '이 위치에 체크인' }));
      await Promise.resolve();
      await Promise.resolve();
    });

    await waitFor(() => expect(screen.getByRole('button', { name: '오늘의 발자국 보기' })).toBeTruthy());
    expect(onViewToday).not.toHaveBeenCalled();

    fireEvent.press(screen.getByRole('button', { name: '오늘의 발자국 보기' }));

    expect(onViewToday).toHaveBeenCalledTimes(1);
  });
});
