import type { SQLiteDatabase } from 'expo-sqlite';

import type { DailyReflectionDraftRepository } from './domain';

const SELECT_DRAFT = `
SELECT body FROM daily_reflection_drafts WHERE local_date = ?;
`;

const UPSERT_DRAFT = `
INSERT INTO daily_reflection_drafts (local_date, body, updated_at)
VALUES (?, ?, ?)
ON CONFLICT(local_date) DO UPDATE SET
  body = excluded.body,
  updated_at = excluded.updated_at;
`;

export class SQLiteDailyReflectionDraftRepository implements DailyReflectionDraftRepository {
  constructor(
    private readonly db: SQLiteDatabase,
    private readonly now: () => string = () => new Date().toISOString(),
  ) {}

  async getDraft(localDate: string): Promise<string | null> {
    const row = await this.db.getFirstAsync<{ body: string }>(SELECT_DRAFT, localDate);
    return row ? row.body : null;
  }

  async saveDraft(localDate: string, body: string): Promise<void> {
    await this.db.runAsync(UPSERT_DRAFT, localDate, body, this.now());
  }

  async clearDraft(localDate: string): Promise<void> {
    await this.db.runAsync('DELETE FROM daily_reflection_drafts WHERE local_date = ?;', localDate);
  }
}
