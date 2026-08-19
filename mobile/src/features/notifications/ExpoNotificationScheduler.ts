import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import type { NotificationSettingsRepository } from '../settings/AppSettingsRepository';
import { buildHourlyCheckInTimes, type ActivityWindow } from './notificationSchedule';

const CHANNEL_ID = 'hourly-check-ins';

export type NotificationScheduleResult =
  | { status: 'scheduled'; scheduledIds: string[] }
  | { status: 'denied' };

export interface NotificationScheduler {
  reschedule(window: ActivityWindow, intervalHours: number): Promise<NotificationScheduleResult>;
  disable(window: ActivityWindow): Promise<void>;
  refreshIfEnabled(): Promise<void>;
}

export class ExpoNotificationScheduler implements NotificationScheduler {
  private mutationQueue: Promise<void> = Promise.resolve();

  constructor(
    private readonly settingsRepository: NotificationSettingsRepository,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async reschedule(window: ActivityWindow, intervalHours: number): Promise<NotificationScheduleResult> {
    return this.enqueue(() => this.performReschedule(window, intervalHours));
  }

  async refreshIfEnabled(): Promise<void> {
    return this.enqueue(async () => {
      const current = await this.settingsRepository.getNotificationSettings();
      if (!current.enabled) return;
      await this.performReschedule(
        { startHour: current.startHour, endHour: current.endHour },
        current.intervalHours,
      );
    });
  }

  private async performReschedule(
    window: ActivityWindow,
    intervalHours: number,
  ): Promise<NotificationScheduleResult> {
    const current = await this.settingsRepository.getNotificationSettings();

    const permission = current.enabled
      ? await Notifications.getPermissionsAsync()
      : await Notifications.requestPermissionsAsync();

    if (!permission.granted) {
      await this.cancelIdentifiers(current.scheduledIds);
      await this.settingsRepository.setNotificationSettings({
        enabled: false,
        ...window,
        intervalHours,
        scheduledIds: [],
      });
      return { status: 'denied' };
    }

    await this.cancelIdentifiers(current.scheduledIds);

    const scheduledIds: string[] = [];
    try {
      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
          name: '시간별 체크인',
          importance: Notifications.AndroidImportance.DEFAULT,
        });
      }

      for (const date of buildHourlyCheckInTimes({ now: this.now(), window, intervalHours, days: 2 })) {
        const identifier = await Notifications.scheduleNotificationAsync({
          content: {
            title: '체크인할 시간이에요',
            body: '지금 있는 곳에 발자국을 남겨 보세요.',
            data: { url: '/check-in', kind: 'hourly-check-in' },
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DATE,
            date,
            channelId: CHANNEL_ID,
          },
        });
        scheduledIds.push(identifier);
      }

      await this.settingsRepository.setNotificationSettings({
        enabled: true,
        ...window,
        intervalHours,
        scheduledIds,
      });

      return { status: 'scheduled', scheduledIds };
    } catch (error) {
      const orphanedIds = await this.cancelIdentifiersBestEffort(scheduledIds);
      await this.recoverDisabledSettings(window, intervalHours, orphanedIds);
      throw error;
    }
  }

  async disable(window: ActivityWindow): Promise<void> {
    return this.enqueue(async () => {
      const current = await this.settingsRepository.getNotificationSettings();
      await this.cancelIdentifiers(current.scheduledIds);
      await this.settingsRepository.setNotificationSettings({
        enabled: false,
        ...window,
        intervalHours: current.intervalHours,
        scheduledIds: [],
      });
    });
  }

  private async cancelIdentifiers(identifiers: string[]): Promise<void> {
    for (const identifier of identifiers) {
      await Notifications.cancelScheduledNotificationAsync(identifier);
    }
  }

  private async cancelIdentifiersBestEffort(identifiers: string[]): Promise<string[]> {
    const results = await Promise.allSettled(
      identifiers.map((identifier) => Notifications.cancelScheduledNotificationAsync(identifier)),
    );
    return identifiers.filter((_, index) => results[index].status === 'rejected');
  }

  private async recoverDisabledSettings(
    window: ActivityWindow,
    intervalHours: number,
    orphanedIds: string[],
  ): Promise<void> {
    try {
      await this.settingsRepository.setNotificationSettings({
        enabled: false,
        ...window,
        intervalHours,
        scheduledIds: orphanedIds,
      });
    } catch {
      // Keep the original scheduling/persistence failure for the caller.
    }
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.mutationQueue.then(operation, operation);
    this.mutationQueue = result.then(() => undefined, () => undefined);
    return result;
  }
}
