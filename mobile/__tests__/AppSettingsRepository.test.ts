import { AppSettingsRepository, DEFAULT_NOTIFICATION_SETTINGS } from '../src/features/settings/AppSettingsRepository';

function createDatabase(storedValue?: string) {
  return {
    getFirstAsync: jest.fn(async () => storedValue === undefined ? null : { value: storedValue }),
    runAsync: jest.fn(async () => ({ changes: 1, lastInsertRowId: 0 })),
  };
}

describe('AppSettingsRepository', () => {
  it.each([
    undefined,
    'not-json',
    JSON.stringify({ enabled: true, startHour: 23, endHour: 7, scheduledIds: [] }),
    JSON.stringify({ enabled: true, startHour: 7, endHour: 23, scheduledIds: [42] }),
  ])('returns defaults when stored notification settings are missing or invalid', async (storedValue) => {
    const repository = new AppSettingsRepository(createDatabase(storedValue) as never);

    await expect(repository.getNotificationSettings()).resolves.toEqual(DEFAULT_NOTIFICATION_SETTINGS);
  });

  it('round-trips validated notification settings under the app settings key', async () => {
    const database = createDatabase();
    const repository = new AppSettingsRepository(database as never);
    const settings = { enabled: true, startHour: 8, endHour: 21, scheduledIds: ['footlog-1'] };

    await repository.setNotificationSettings(settings);

    expect(database.runAsync).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO app_settings'),
      'hourly_notification_settings',
      JSON.stringify(settings),
      expect.any(String),
    );
  });
});
