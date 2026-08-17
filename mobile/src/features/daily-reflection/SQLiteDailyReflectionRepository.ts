import type { SQLiteDatabase } from 'expo-sqlite';

import type { DailyReflection, DailyReflectionRepository } from './domain';

type DailyReflectionRow = {
  id: string;
  local_date: string;
  body: string;
  updated_at: string;
};

const SELECT_BY_LOCAL_DATE = `
SELECT * FROM daily_reflections WHERE local_date = ?;
`;

const UPSERT_BY_LOCAL_DATE = `
INSERT INTO daily_reflections (id, local_date, body, updated_at)
VALUES (?, ?, ?, ?)
ON CONFLICT(local_date) DO UPDATE SET
  body = excluded.body,
  updated_at = excluded.updated_at;
`;

function toDailyReflection(row: DailyReflectionRow): DailyReflection {
  return {
    id: row.id,
    localDate: row.local_date,
    body: row.body,
    updatedAt: row.updated_at,
  };
}

export class SQLiteDailyReflectionRepository implements DailyReflectionRepository {
  constructor(private readonly db: SQLiteDatabase) {}

  async getByLocalDate(localDate: string): Promise<DailyReflection | null> {
    const row = await this.db.getFirstAsync<DailyReflectionRow>(SELECT_BY_LOCAL_DATE, localDate);
    return row ? toDailyReflection(row) : null;
  }

  async save(reflection: DailyReflection): Promise<void> {
    await this.db.runAsync(
      UPSERT_BY_LOCAL_DATE,
      reflection.id,
      reflection.localDate,
      reflection.body,
      reflection.updatedAt,
    );
  }

  async deleteByLocalDate(localDate: string): Promise<void> {
    await this.db.runAsync('DELETE FROM daily_reflections WHERE local_date = ?;', localDate);
  }
}
