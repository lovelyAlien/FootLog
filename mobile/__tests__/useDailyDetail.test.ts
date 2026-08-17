const mockCheckInRepository = { listByLocalDay: jest.fn() };
const mockReflectionRepository = { getByLocalDate: jest.fn() };
const mockDraftRepository = { getDraft: jest.fn() };
const mockNotificationSettingsRepository = { getNotificationSettings: jest.fn() };

jest.mock('../src/database/FootLogContext', () => ({
  useFootLogRepository: () => mockCheckInRepository,
}));
jest.mock('../src/features/daily-reflection/DailyReflectionContext', () => ({
  useDailyReflectionDependencies: () => ({
    reflectionRepository: mockReflectionRepository,
    draftRepository: mockDraftRepository,
  }),
}));
jest.mock('../src/features/notifications/NotificationSettingsContext', () => ({
  useNotificationSettingsDependencies: () => ({ repository: mockNotificationSettingsRepository }),
}));

import { act, renderHook, waitFor } from '@testing-library/react-native';

import { useDailyDetail } from '../src/features/daily-reflection/useDailyDetail';
import type { CheckIn } from '../src/features/check-in/domain';

const checkIn: CheckIn = {
  id: 'c1',
  latitude: 37.5,
  longitude: 127.0,
  accuracyM: 10,
  capturedAt: '2026-08-16T09:00:00.000Z',
  checkedInAt: '2026-08-16T09:00:00.000Z',
  createdAt: '2026-08-16T09:00:00.000Z',
  syncStatus: 'pending',
};

describe('useDailyDetail', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('loads check-ins, reflection, draft, and activity window in parallel', async () => {
    mockCheckInRepository.listByLocalDay.mockResolvedValue([checkIn]);
    mockReflectionRepository.getByLocalDate.mockResolvedValue(null);
    mockDraftRepository.getDraft.mockResolvedValue('초안');
    mockNotificationSettingsRepository.getNotificationSettings.mockResolvedValue({
      enabled: true, startHour: 7, endHour: 23, scheduledIds: [],
    });

    const { result } = await renderHook(() => useDailyDetail('2026-08-16'));

    await waitFor(() => expect(result.current.state.status).toBe('loaded'));

    expect(result.current.state).toEqual({
      status: 'loaded',
      checkIns: [checkIn],
      reflection: null,
      draft: '초안',
      activityWindow: { startHour: 7, endHour: 23 },
    });
  });

  it('reports an error state when any of the loads fail', async () => {
    mockCheckInRepository.listByLocalDay.mockRejectedValue(new Error('db unavailable'));
    mockReflectionRepository.getByLocalDate.mockResolvedValue(null);
    mockDraftRepository.getDraft.mockResolvedValue(null);
    mockNotificationSettingsRepository.getNotificationSettings.mockResolvedValue({
      enabled: false, startHour: 7, endHour: 23, scheduledIds: [],
    });

    const { result } = await renderHook(() => useDailyDetail('2026-08-16'));

    await waitFor(() => expect(result.current.state).toEqual({ status: 'error' }));
  });

  it('reloads when reload() is called', async () => {
    mockCheckInRepository.listByLocalDay.mockResolvedValue([]);
    mockReflectionRepository.getByLocalDate.mockResolvedValue(null);
    mockDraftRepository.getDraft.mockResolvedValue(null);
    mockNotificationSettingsRepository.getNotificationSettings.mockResolvedValue({
      enabled: false, startHour: 7, endHour: 23, scheduledIds: [],
    });

    const { result } = await renderHook(() => useDailyDetail('2026-08-16'));
    await waitFor(() => expect(result.current.state.status).toBe('loaded'));

    await act(() => { result.current.reload(); });

    await waitFor(() => expect(mockCheckInRepository.listByLocalDay).toHaveBeenCalledTimes(2));
  });
});
