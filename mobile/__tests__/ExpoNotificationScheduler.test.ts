import { Platform } from 'react-native';

import { ExpoNotificationScheduler } from '../src/features/notifications/ExpoNotificationScheduler';
import type { NotificationSettingsRepository } from '../src/features/settings/AppSettingsRepository';

const mockGetPermissionsAsync = jest.fn();
const mockRequestPermissionsAsync = jest.fn();
const mockCancelScheduledNotificationAsync = jest.fn();
const mockScheduleNotificationAsync = jest.fn();
const mockSetNotificationChannelAsync = jest.fn();

jest.mock('expo-notifications', () => ({
  AndroidImportance: { DEFAULT: 3 },
  SchedulableTriggerInputTypes: { DATE: 'date' },
  getPermissionsAsync: (...args: unknown[]) => mockGetPermissionsAsync(...args),
  requestPermissionsAsync: (...args: unknown[]) => mockRequestPermissionsAsync(...args),
  cancelScheduledNotificationAsync: (...args: unknown[]) => mockCancelScheduledNotificationAsync(...args),
  scheduleNotificationAsync: (...args: unknown[]) => mockScheduleNotificationAsync(...args),
  setNotificationChannelAsync: (...args: unknown[]) => mockSetNotificationChannelAsync(...args),
}));

function createRepository(initial: {
  enabled: boolean;
  startHour: number;
  endHour: number;
  intervalHours: number;
  scheduledIds: string[];
}): NotificationSettingsRepository & { setNotificationSettings: jest.Mock } {
  return {
    getNotificationSettings: jest.fn(async () => initial),
    setNotificationSettings: jest.fn(async () => undefined),
  };
}

describe('ExpoNotificationScheduler', () => {
  beforeEach(() => {
    mockGetPermissionsAsync.mockReset();
    mockRequestPermissionsAsync.mockReset();
    mockCancelScheduledNotificationAsync.mockReset();
    mockScheduleNotificationAsync.mockReset();
    mockSetNotificationChannelAsync.mockReset();
    mockGetPermissionsAsync.mockResolvedValue({ status: 'granted', granted: true, canAskAgain: true, expires: 'never' });
    mockRequestPermissionsAsync.mockResolvedValue({ status: 'granted', granted: true, canAskAgain: true, expires: 'never' });
    mockCancelScheduledNotificationAsync.mockResolvedValue(undefined);
    mockScheduleNotificationAsync
      .mockResolvedValueOnce('new-1')
      .mockResolvedValueOnce('new-2')
      .mockResolvedValueOnce('new-3')
      .mockResolvedValueOnce('new-4');
    mockSetNotificationChannelAsync.mockResolvedValue(null);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('requests permission when enabling and schedules check-in notifications with the FootLog route', async () => {
    const repository = createRepository({ enabled: false, startHour: 7, endHour: 23, intervalHours: 1, scheduledIds: [] });
    const scheduler = new ExpoNotificationScheduler(repository, () => new Date('2026-08-06T08:32:00+09:00'));

    const result = await scheduler.reschedule({ startHour: 9, endHour: 10 }, 1);

    expect(mockRequestPermissionsAsync).toHaveBeenCalledTimes(1);
    expect(mockScheduleNotificationAsync).toHaveBeenCalledTimes(4);
    expect(mockScheduleNotificationAsync).toHaveBeenNthCalledWith(1, {
      content: {
        title: '체크인할 시간이에요',
        body: '지금 있는 곳에 발자국을 남겨 보세요.',
        data: { url: '/check-in', kind: 'hourly-check-in' },
      },
      trigger: {
        type: 'date',
        date: new Date('2026-08-06T09:00:00+09:00'),
        channelId: 'hourly-check-ins',
      },
    });
    expect(result).toEqual({
      status: 'scheduled',
      scheduledIds: ['new-1', 'new-2', 'new-3', 'new-4'],
    });
  });

  it('cancels only stored FootLog identifiers before rebuilding without asking permission again', async () => {
    const repository = createRepository({
      enabled: true,
      startHour: 7,
      endHour: 23,
      intervalHours: 1,
      scheduledIds: ['footlog-old-1', 'footlog-old-2'],
    });
    const scheduler = new ExpoNotificationScheduler(repository, () => new Date('2026-08-06T08:32:00+09:00'));

    await scheduler.reschedule({ startHour: 9, endHour: 10 }, 1);

    expect(mockGetPermissionsAsync).toHaveBeenCalledTimes(1);
    expect(mockRequestPermissionsAsync).not.toHaveBeenCalled();
    expect(mockCancelScheduledNotificationAsync.mock.calls).toEqual([
      ['footlog-old-1'],
      ['footlog-old-2'],
    ]);
    expect(repository.setNotificationSettings).toHaveBeenLastCalledWith({
      enabled: true,
      startHour: 9,
      endHour: 10,
      intervalHours: 1,
      scheduledIds: ['new-1', 'new-2', 'new-3', 'new-4'],
    });
  });

  it('persists a newly chosen interval when rescheduling', async () => {
    mockScheduleNotificationAsync
      .mockReset()
      .mockResolvedValueOnce('new-1')
      .mockResolvedValueOnce('new-2')
      .mockResolvedValueOnce('new-3')
      .mockResolvedValueOnce('new-4');
    const repository = createRepository({
      enabled: true, startHour: 7, endHour: 22, intervalHours: 1, scheduledIds: ['old-id'],
    });
    const scheduler = new ExpoNotificationScheduler(repository, () => new Date('2026-08-06T06:00:00+09:00'));

    await scheduler.reschedule({ startHour: 7, endHour: 9 }, 2);

    // Window 7-9 with a 2-hour interval yields hours [7, 9] each day; performReschedule
    // always schedules 2 days ahead, so 2 hours x 2 days = 4 notifications.
    expect(mockScheduleNotificationAsync).toHaveBeenCalledTimes(4);
    expect(repository.setNotificationSettings).toHaveBeenLastCalledWith({
      enabled: true,
      startHour: 7,
      endHour: 9,
      intervalHours: 2,
      scheduledIds: ['new-1', 'new-2', 'new-3', 'new-4'],
    });
  });

  it('refreshes an enabled two-day schedule using the stored interval without asking for permission again', async () => {
    const repository = createRepository({
      enabled: true,
      startHour: 9,
      endHour: 10,
      intervalHours: 1,
      scheduledIds: ['expiring-footlog-id'],
    });
    const scheduler = new ExpoNotificationScheduler(repository, () => new Date('2026-08-08T08:32:00+09:00'));

    await scheduler.refreshIfEnabled();

    expect(mockRequestPermissionsAsync).not.toHaveBeenCalled();
    expect(mockCancelScheduledNotificationAsync).toHaveBeenCalledWith('expiring-footlog-id');
    expect(mockScheduleNotificationAsync).toHaveBeenCalledTimes(4);
    expect(repository.setNotificationSettings).toHaveBeenLastCalledWith({
      enabled: true,
      startHour: 9,
      endHour: 10,
      intervalHours: 1,
      scheduledIds: ['new-1', 'new-2', 'new-3', 'new-4'],
    });
  });

  it('does not refresh when reminders are disabled', async () => {
    const repository = createRepository({
      enabled: false,
      startHour: 7,
      endHour: 23,
      intervalHours: 1,
      scheduledIds: [],
    });
    const scheduler = new ExpoNotificationScheduler(repository);

    await scheduler.refreshIfEnabled();

    expect(mockGetPermissionsAsync).not.toHaveBeenCalled();
    expect(mockScheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it('recovers from permission revoked after enabling without requesting again', async () => {
    mockGetPermissionsAsync.mockResolvedValue({
      status: 'denied', granted: false, canAskAgain: true, expires: 'never',
    });
    const repository = createRepository({
      enabled: true,
      startHour: 7,
      endHour: 23,
      intervalHours: 1,
      scheduledIds: ['footlog-old'],
    });
    const scheduler = new ExpoNotificationScheduler(repository, () => new Date('2026-08-06T08:32:00+09:00'));

    await expect(scheduler.reschedule({ startHour: 9, endHour: 10 }, 1)).resolves.toEqual({ status: 'denied' });

    expect(mockRequestPermissionsAsync).not.toHaveBeenCalled();
    expect(mockCancelScheduledNotificationAsync).toHaveBeenCalledWith('footlog-old');
    expect(mockScheduleNotificationAsync).not.toHaveBeenCalled();
    expect(repository.setNotificationSettings).toHaveBeenCalledWith({
      enabled: false,
      startHour: 9,
      endHour: 10,
      intervalHours: 1,
      scheduledIds: [],
    });
  });

  it('returns denied and leaves reminders disabled without scheduling', async () => {
    mockRequestPermissionsAsync.mockResolvedValue({
      status: 'denied', granted: false, canAskAgain: false, expires: 'never',
    });
    const repository = createRepository({ enabled: false, startHour: 7, endHour: 23, intervalHours: 1, scheduledIds: [] });
    const scheduler = new ExpoNotificationScheduler(repository, () => new Date('2026-08-06T08:32:00+09:00'));

    await expect(scheduler.reschedule({ startHour: 9, endHour: 10 }, 1)).resolves.toEqual({ status: 'denied' });

    expect(mockScheduleNotificationAsync).not.toHaveBeenCalled();
    expect(repository.setNotificationSettings).toHaveBeenLastCalledWith({
      enabled: false,
      startHour: 9,
      endHour: 10,
      intervalHours: 1,
      scheduledIds: [],
    });
  });

  it('uses the hourly-check-ins Android channel', async () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    const repository = createRepository({ enabled: false, startHour: 7, endHour: 23, intervalHours: 1, scheduledIds: [] });
    const scheduler = new ExpoNotificationScheduler(repository, () => new Date('2026-08-06T08:32:00+09:00'));

    await scheduler.reschedule({ startHour: 9, endHour: 10 }, 1);

    expect(mockSetNotificationChannelAsync).toHaveBeenCalledWith('hourly-check-ins', {
      name: '시간별 체크인',
      importance: 3,
    });
  });

  it('disables reminders by canceling only stored identifiers and preserves the stored interval', async () => {
    const repository = createRepository({
      enabled: true,
      startHour: 8,
      endHour: 21,
      intervalHours: 3,
      scheduledIds: ['footlog-1', 'footlog-2'],
    });
    const scheduler = new ExpoNotificationScheduler(repository);

    await scheduler.disable({ startHour: 8, endHour: 21 });

    expect(mockCancelScheduledNotificationAsync.mock.calls).toEqual([
      ['footlog-1'],
      ['footlog-2'],
    ]);
    expect(repository.setNotificationSettings).toHaveBeenCalledWith({
      enabled: false,
      startHour: 8,
      endHour: 21,
      intervalHours: 3,
      scheduledIds: [],
    });
    expect(mockRequestPermissionsAsync).not.toHaveBeenCalled();
  });

  it('cancels every newly-created notification when settings persistence fails', async () => {
    const persistenceError = new Error('settings persistence failed');
    const repository = createRepository({
      enabled: false,
      startHour: 7,
      endHour: 23,
      intervalHours: 1,
      scheduledIds: [],
    });
    repository.setNotificationSettings
      .mockRejectedValueOnce(persistenceError)
      .mockResolvedValueOnce(undefined);
    const scheduler = new ExpoNotificationScheduler(repository, () => new Date('2026-08-06T08:32:00+09:00'));

    await expect(scheduler.reschedule({ startHour: 9, endHour: 10 }, 1)).rejects.toBe(persistenceError);

    expect(mockCancelScheduledNotificationAsync.mock.calls).toEqual([
      ['new-1'],
      ['new-2'],
      ['new-3'],
      ['new-4'],
    ]);
  });

  it('best-effort cancels notifications created before a partial scheduling failure', async () => {
    const schedulingError = new Error('schedule failed');
    mockScheduleNotificationAsync
      .mockReset()
      .mockResolvedValueOnce('partial-new-1')
      .mockRejectedValueOnce(schedulingError);
    const repository = createRepository({
      enabled: false,
      startHour: 7,
      endHour: 23,
      intervalHours: 1,
      scheduledIds: [],
    });
    const scheduler = new ExpoNotificationScheduler(repository, () => new Date('2026-08-06T08:32:00+09:00'));

    await expect(scheduler.reschedule({ startHour: 9, endHour: 10 }, 1)).rejects.toBe(schedulingError);

    expect(mockCancelScheduledNotificationAsync).toHaveBeenCalledWith('partial-new-1');
  });

  it('persists a newly-created identifier when rollback cancellation fails', async () => {
    const schedulingError = new Error('schedule failed');
    mockScheduleNotificationAsync
      .mockReset()
      .mockResolvedValueOnce('orphaned-new-id')
      .mockRejectedValueOnce(schedulingError);
    mockCancelScheduledNotificationAsync.mockRejectedValueOnce(new Error('cancel failed'));
    const repository = createRepository({
      enabled: false,
      startHour: 7,
      endHour: 23,
      intervalHours: 1,
      scheduledIds: [],
    });
    const scheduler = new ExpoNotificationScheduler(repository, () => new Date('2026-08-06T08:32:00+09:00'));

    await expect(scheduler.reschedule({ startHour: 9, endHour: 10 }, 1)).rejects.toBe(schedulingError);

    expect(repository.setNotificationSettings).toHaveBeenLastCalledWith({
      enabled: false,
      startHour: 9,
      endHour: 10,
      intervalHours: 1,
      scheduledIds: ['orphaned-new-id'],
    });
  });

  it('recovers persisted settings to disabled after rebuilding fails', async () => {
    const schedulingError = new Error('schedule failed');
    mockScheduleNotificationAsync.mockReset().mockRejectedValueOnce(schedulingError);
    const repository = createRepository({
      enabled: true,
      startHour: 7,
      endHour: 23,
      intervalHours: 1,
      scheduledIds: ['old-footlog-id'],
    });
    const scheduler = new ExpoNotificationScheduler(repository, () => new Date('2026-08-06T08:32:00+09:00'));

    await expect(scheduler.reschedule({ startHour: 9, endHour: 10 }, 1)).rejects.toBe(schedulingError);

    expect(repository.setNotificationSettings).toHaveBeenCalledWith({
      enabled: false,
      startHour: 9,
      endHour: 10,
      intervalHours: 1,
      scheduledIds: [],
    });
  });
});
