import type { SQLiteDatabase } from 'expo-sqlite';

const VERSION_1_SCHEMA = `
PRAGMA journal_mode = WAL;
CREATE TABLE IF NOT EXISTS check_ins (
  id TEXT PRIMARY KEY NOT NULL,
  checked_in_at TEXT NOT NULL,
  captured_at TEXT NOT NULL,
  latitude REAL NOT NULL,
  longitude REAL NOT NULL,
  accuracy_m REAL NOT NULL CHECK (accuracy_m >= 0),
  created_at TEXT NOT NULL,
  sync_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (sync_status IN ('pending'))
);
CREATE INDEX IF NOT EXISTS idx_check_ins_checked_in_at
  ON check_ins(checked_in_at);
CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
PRAGMA user_version = 1;
`;

export async function migrateDatabase(db: SQLiteDatabase): Promise<void> {
  const version = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');

  if ((version?.user_version ?? 0) < 1) {
    await db.withTransactionAsync(async () => {
      await db.execAsync(VERSION_1_SCHEMA);
    });
  }
}
