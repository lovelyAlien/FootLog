import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';

import { migrateDatabase } from './migrate';

export async function openFootLogDatabase(): Promise<SQLiteDatabase> {
  const database = await openDatabaseAsync('footlog.db');
  await migrateDatabase(database);
  return database;
}
