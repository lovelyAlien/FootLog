jest.mock('expo-sqlite', () => ({
  openDatabaseAsync: jest.fn(),
}));

import { openDatabaseAsync } from 'expo-sqlite';

import { migrateDatabase } from '../src/database/migrate';
import { openFootLogDatabase } from '../src/database/openDatabase';

describe('migrateDatabase', () => {
  it('runs the version-1 schema exactly once and records version 1', async () => {
    const execAsync = jest.fn<Promise<void>, [string]>().mockResolvedValue(undefined);
    const db = {
      getFirstAsync: jest
        .fn<Promise<{ user_version: number }>, [string]>()
        .mockResolvedValueOnce({ user_version: 0 })
        .mockResolvedValueOnce({ user_version: 1 }),
      execAsync,
      withTransactionAsync: jest.fn(async (task: () => Promise<void>) => task()),
      runAsync: jest.fn(),
      getAllAsync: jest.fn(),
    };

    await migrateDatabase(db as never);
    await migrateDatabase(db as never);

    expect(execAsync).toHaveBeenCalledTimes(1);
    expect(execAsync.mock.calls[0][0]).toContain('CREATE TABLE IF NOT EXISTS check_ins');
    expect(execAsync.mock.calls[0][0]).toContain('PRAGMA user_version = 1');
    expect(db.withTransactionAsync).toHaveBeenCalledTimes(1);
  });

  it('opens FootLog before applying its migrations', async () => {
    const db = {
      getFirstAsync: jest.fn().mockResolvedValue({ user_version: 1 }),
      execAsync: jest.fn(),
      withTransactionAsync: jest.fn(),
      runAsync: jest.fn(),
      getAllAsync: jest.fn(),
    };
    jest.mocked(openDatabaseAsync).mockResolvedValue(db as never);

    await expect(openFootLogDatabase()).resolves.toBe(db);

    expect(openDatabaseAsync).toHaveBeenCalledWith('footlog.db');
    expect(db.getFirstAsync).toHaveBeenCalledWith('PRAGMA user_version');
  });
});
