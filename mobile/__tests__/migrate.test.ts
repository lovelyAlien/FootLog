jest.mock('expo-sqlite', () => ({
  openDatabaseAsync: jest.fn(),
}));

import { openDatabaseAsync } from 'expo-sqlite';

import { migrateDatabase } from '../src/database/migrate';
import { openFootLogDatabase } from '../src/database/openDatabase';

function createDb(userVersion: number) {
  return {
    getFirstAsync: jest.fn().mockResolvedValue({ user_version: userVersion }),
    execAsync: jest.fn(),
    withTransactionAsync: jest.fn(async (task: () => Promise<void>) => { await task(); }),
    runAsync: jest.fn(),
    getAllAsync: jest.fn(),
  };
}

describe('migrateDatabase', () => {
  it('applies both version-1 and version-2 schema to a fresh database', async () => {
    const db = createDb(0);

    await migrateDatabase(db as never);

    expect(db.execAsync).toHaveBeenCalledTimes(3);
    expect(db.execAsync.mock.calls[0][0]).toBe('PRAGMA journal_mode = WAL;');
    expect(db.execAsync.mock.calls[1][0]).toContain('CREATE TABLE IF NOT EXISTS check_ins');
    expect(db.execAsync.mock.calls[1][0]).toContain('PRAGMA user_version = 1');
    expect(db.execAsync.mock.calls[2][0]).toContain('CREATE TABLE IF NOT EXISTS daily_reflections');
    expect(db.execAsync.mock.calls[2][0]).toContain('CREATE TABLE IF NOT EXISTS daily_reflection_drafts');
    expect(db.execAsync.mock.calls[2][0]).toContain('PRAGMA user_version = 2');
    expect(db.withTransactionAsync).toHaveBeenCalledTimes(2);
  });

  it('applies only version-2 schema to a database already at version 1', async () => {
    const db = createDb(1);

    await migrateDatabase(db as never);

    expect(db.execAsync).toHaveBeenCalledTimes(1);
    expect(db.execAsync.mock.calls[0][0]).toContain('CREATE TABLE IF NOT EXISTS daily_reflections');
    expect(db.withTransactionAsync).toHaveBeenCalledTimes(1);
  });

  it('does nothing to a database already at version 2', async () => {
    const db = createDb(2);

    await migrateDatabase(db as never);

    expect(db.execAsync).not.toHaveBeenCalled();
    expect(db.withTransactionAsync).not.toHaveBeenCalled();
  });

  it('opens FootLog before applying its migrations', async () => {
    const db = createDb(2);
    jest.mocked(openDatabaseAsync).mockResolvedValue(db as never);

    await expect(openFootLogDatabase()).resolves.toBe(db);

    expect(openDatabaseAsync).toHaveBeenCalledWith('footlog.db');
    expect(db.getFirstAsync).toHaveBeenCalledWith('PRAGMA user_version');
  });
});
