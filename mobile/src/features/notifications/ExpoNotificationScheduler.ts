import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import type { NotificationSettingsRepository } from '../settings/AppSettingsRepository';
import { buildHourlyCheckInTimes, type ActivityWindow } from './notificationSchedule';

const CHANNEL_ID = 'hourly-check-ins';

export type NotificationScheduleResult =
  | { status: 'scheduled'; scheduledIds: string[] }
  | { status: 'denied' };

export interface NotificationScheduler {
  reschedule(window: ActivityWindow): Promise<NotificationScheduleResult>;
  disable(window: ActivityWindow): Promise<void>;
}

export class ExpoNotificationScheduler implements NotificationScheduler {
  constructor(
    private readonly settingsRepository: NotificationSettingsRepository,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async reschedule(window: ActivityWindow): Promise<NotificationScheduleResult> {
    const current = await this.settingsRepository.getNotificationSettings();

    const permission = current.enabled
      ? await Notifications.getPermissionsAsync()
      : await Notifications.requestPermissionsAsync();

    if (!permission.granted) {
      await this.cancelIdentifiers(current.scheduledIds);
      await this.settingsRepository.setNotificationSettings({
        enabled: false,
        ...window,
        scheduledIds: [],
      });
      return { status: 'denied' };
    }

    await this.cancelIdentifiers(current.scheduledIds);

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
        name: '시간별 체크인',
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }

    const scheduledIds: string[] = [];
    try {
      for (const date of buildHourlyCheckInTimes({ now: this.now(), window, days: 2 })) {
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
    } catch (error) {
      await this.cancelIdentifiers(scheduledIds);
      throw error;
    }

    await this.settingsRepository.setNotificationSettings({
      enabled: true,
      ...window,
      scheduledIds,
    });

    return { status: 'scheduled', scheduledIds };
  }

  async disable(window: ActivityWindow): Promise<void> {
    const current = await this.settingsRepository.getNotificationSettings();
    await this.cancelIdentifiers(current.scheduledIds);
    await this.settingsRepository.setNotificationSettings({
      enabled: false,
      ...window,
      scheduledIds: [],
    });
  }

  private async cancelIdentifiers(identifiers: string[]): Promise<void> {
    for (const identifier of identifiers) {
      await Notifications.cancelScheduledNotificationAsync(identifier);
    }
  }
}
