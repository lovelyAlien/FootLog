import type { SQLiteDatabase } from 'expo-sqlite';

export const HOURLY_NOTIFICATION_SETTINGS_KEY = 'hourly_notification_settings';

export type NotificationSettings = {
  enabled: boolean;
  startHour: number;
  endHour: number;
  intervalHours: number;
  scheduledIds: string[];
};

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  enabled: false,
  startHour: 7,
  endHour: 23,
  intervalHours: 1,
  scheduledIds: [],
};

export interface NotificationSettingsRepository {
  getNotificationSettings(): Promise<NotificationSettings>;
  setNotificationSettings(settings: NotificationSettings): Promise<void>;
}

function isValidHour(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 23;
}

function isValidIntervalHours(value: unknown): value is number {
  return value === 1 || value === 2 || value === 3;
}

function decodeNotificationSettings(value: string): NotificationSettings | null {
  try {
    const decoded: unknown = JSON.parse(value);
    if (!decoded || typeof decoded !== 'object') return null;

    const candidate = decoded as Record<string, unknown>;
    const intervalHours = candidate.intervalHours === undefined ? 1 : candidate.intervalHours;

    if (
      typeof candidate.enabled !== 'boolean'
      || !isValidHour(candidate.startHour)
      || !isValidHour(candidate.endHour)
      || candidate.startHour >= candidate.endHour
      || !isValidIntervalHours(intervalHours)
      || !Array.isArray(candidate.scheduledIds)
      || !candidate.scheduledIds.every((id) => typeof id === 'string')
    ) {
      return null;
    }

    return {
      enabled: candidate.enabled,
      startHour: candidate.startHour,
      endHour: candidate.endHour,
      intervalHours,
      scheduledIds: [...candidate.scheduledIds],
    };
  } catch {
    return null;
  }
}

function defaultNotificationSettings(): NotificationSettings {
  return { ...DEFAULT_NOTIFICATION_SETTINGS, scheduledIds: [] };
}

export class AppSettingsRepository implements NotificationSettingsRepository {
  constructor(private readonly database: SQLiteDatabase) {}

  async getNotificationSettings(): Promise<NotificationSettings> {
    const row = await this.database.getFirstAsync<{ value: string }>(
      'SELECT value FROM app_settings WHERE key = ?',
      HOURLY_NOTIFICATION_SETTINGS_KEY,
    );

    return row ? decodeNotificationSettings(row.value) ?? defaultNotificationSettings() : defaultNotificationSettings();
  }

  async setNotificationSettings(settings: NotificationSettings): Promise<void> {
    const validated = decodeNotificationSettings(JSON.stringify(settings));
    if (!validated) throw new TypeError('Invalid notification settings');

    await this.database.runAsync(
      `INSERT INTO app_settings (key, value, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      HOURLY_NOTIFICATION_SETTINGS_KEY,
      JSON.stringify(validated),
      new Date().toISOString(),
    );
  }
}
