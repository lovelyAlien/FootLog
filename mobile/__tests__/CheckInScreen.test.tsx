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

async function renderScreen(
  locationGateway: LocationGateway = new FakeLocationGateway(),
  repository = new FakeCheckInRepository(),
) {
  const view = await render(
    <CheckInScreen
      deps={{
        locationGateway,
        repository,
        uuid: () => '11111111-1111-4111-8111-111111111111',
        now: () => '2026-08-06T00:00:03.000Z',
      }}
    />,
  );
  return { repository, view };
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

    expect(screen.getByText('정확도 약 42m')).toBeTruthy();
    expect(screen.getByRole('button', { name: '다시 찾기' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '이 위치에 체크인' })).toBeTruthy();
  });

  it('does not save until 이 위치에 체크인 is pressed', async () => {
    const { repository } = await renderScreen();

    await waitFor(() => expect(screen.getByRole('button', { name: '이 위치에 체크인' })).toBeTruthy());
    expect(repository.saved).toEqual([]);

    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: '이 위치에 체크인' }));
      await Promise.resolve();
      await Promise.resolve();
    });

    await waitFor(() => expect(repository.saved).toHaveLength(1));
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
      fireEvent.press(screen.getByRole('button', { name: '이 위치에 체크인' }));
      await Promise.resolve();
      await Promise.resolve();
    });

    await waitFor(() => expect(screen.getByText('완료')).toBeTruthy());
    expect(screen.getByRole('button', { name: '오늘의 발자국 보기' })).toBeTruthy();
  });
});
