import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

import { TodayCheckIns } from '../src/features/check-in/TodayCheckIns';
import type { CheckIn } from '../src/features/check-in/domain';

const mockPush = jest.fn();
let mockRepository: { listByLocalDay: jest.Mock };
let mockFocusEffect: (() => void | (() => void)) | undefined;

jest.mock('expo-router', () => ({
  useFocusEffect: (effect: () => void | (() => void)) => { mockFocusEffect = effect; },
  useRouter: () => ({ push: mockPush }),
}));

jest.mock('../src/database/FootLogContext', () => ({
  useFootLogRepository: () => mockRepository,
}));

import TodayRoute from '../app/(tabs)/index';

const firstCheckIn: CheckIn = {
  id: 'first',
  checkedInAt: '2026-08-06T00:15:00.000Z',
  capturedAt: '2026-08-06T00:14:58.000Z',
  latitude: 37.5,
  longitude: 127.0,
  accuracyM: 12,
  createdAt: '2026-08-06T00:15:00.000Z',
  syncStatus: 'pending',
};

const secondCheckIn: CheckIn = {
  ...firstCheckIn,
  id: 'second',
  checkedInAt: '2026-08-06T08:45:00.000Z',
  accuracyM: 28,
};

describe('TodayCheckIns', () => {
  it('shows 지금 체크인 when today has no records', async () => {
    const view = await render(<TodayCheckIns checkIns={[]} onStartCheckIn={jest.fn()} />);

    expect(view.getByText('오늘의 발자국이 아직 없어요.')).toBeTruthy();
    expect(view.getByRole('button', { name: '지금 체크인' })).toBeTruthy();
  });

  it('shows today check-ins in chronological order with local times and accuracy', async () => {
    const view = await render(<TodayCheckIns checkIns={[secondCheckIn, firstCheckIn]} onStartCheckIn={jest.fn()} />);

    expect(view.getAllByTestId('check-in-time').map((item) => item.props.children)).toEqual([
      '09:15',
      '17:45',
    ]);
    expect(view.getByText('정확도 약 12m')).toBeTruthy();
    expect(view.getByText('정확도 약 28m')).toBeTruthy();
  });

  it('opens /check-in from 지금 체크인', async () => {
    const onStartCheckIn = jest.fn();
    const view = await render(<TodayCheckIns checkIns={[]} onStartCheckIn={onStartCheckIn} />);

    await fireEvent.press(view.getByRole('button', { name: '지금 체크인' }));

    expect(onStartCheckIn).toHaveBeenCalledTimes(1);
  });

  it('opens reminder settings from the Today header', async () => {
    const onOpenReminderSettings = jest.fn();
    const view = await render(
      <TodayCheckIns
        checkIns={[]}
        onStartCheckIn={jest.fn()}
        onOpenReminderSettings={onOpenReminderSettings}
      />,
    );

    await fireEvent.press(view.getByRole('button', { name: '알림 설정' }));

    expect(onOpenReminderSettings).toHaveBeenCalledTimes(1);
  });

  it('refreshes after the check-in route regains focus', async () => {
    mockRepository = {
      listByLocalDay: jest.fn()
        .mockResolvedValueOnce([firstCheckIn])
        .mockResolvedValueOnce([secondCheckIn]),
    };

    const view = await render(<TodayRoute />);

    await act(async () => { mockFocusEffect?.(); });
    await waitFor(() => expect(view.getByText('정확도 약 12m')).toBeTruthy());

    await act(async () => { mockFocusEffect?.(); });
    await waitFor(() => expect(view.getByText('정확도 약 28m')).toBeTruthy());

    expect(mockRepository.listByLocalDay).toHaveBeenCalledTimes(2);
  });
});
