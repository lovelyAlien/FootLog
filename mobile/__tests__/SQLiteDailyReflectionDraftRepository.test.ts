import { SQLiteDailyReflectionDraftRepository } from '../src/features/daily-reflection/SQLiteDailyReflectionDraftRepository';

type DraftRow = { local_date: string; body: string; updated_at: string };

function createFakeDb() {
  const rows: DraftRow[] = [];

  const db = {
    getFirstAsync: jest.fn(async (sql: string, localDate: string) => {
      if (sql.includes('SELECT body FROM daily_reflection_drafts')) {
        return rows.find((row) => row.local_date === localDate) ?? null;
      }
      return null;
    }),
    runAsync: jest.fn(async (sql: string, ...params: unknown[]) => {
      if (sql.includes('INSERT INTO daily_reflection_drafts')) {
        const [localDate, body, updatedAt] = params as [string, string, string];
        const existingIndex = rows.findIndex((row) => row.local_date === localDate);
        if (existingIndex >= 0) {
          rows[existingIndex] = { local_date: localDate, body, updated_at: updatedAt };
        } else {
          rows.push({ local_date: localDate, body, updated_at: updatedAt });
        }
      } else if (sql.startsWith('DELETE FROM daily_reflection_drafts')) {
        const [localDate] = params as [string];
        const index = rows.findIndex((row) => row.local_date === localDate);
        if (index >= 0) rows.splice(index, 1);
      }
      return { changes: 1, lastInsertRowId: 0 };
    }),
    execAsync: jest.fn(),
    withTransactionAsync: jest.fn(),
    getAllAsync: jest.fn(),
  };

  return { db, rows };
}

describe('SQLiteDailyReflectionDraftRepository', () => {
  it('returns null when no draft exists', async () => {
    const { db } = createFakeDb();
    const repository = new SQLiteDailyReflectionDraftRepository(db as never, () => '2026-08-16T00:00:00.000Z');

    await expect(repository.getDraft('2026-08-16')).resolves.toBeNull();
  });

  it('saves and reads back a draft body', async () => {
    const { db } = createFakeDb();
    const repository = new SQLiteDailyReflectionDraftRepository(db as never, () => '2026-08-16T09:00:00.000Z');

    await repository.saveDraft('2026-08-16', '쓰는 중...');

    await expect(repository.getDraft('2026-08-16')).resolves.toBe('쓰는 중...');
  });

  it('overwrites the same date on repeated saves instead of creating rows', async () => {
    const { db, rows } = createFakeDb();
    const repository = new SQLiteDailyReflectionDraftRepository(db as never, () => '2026-08-16T09:00:00.000Z');

    await repository.saveDraft('2026-08-16', '초안 1');
    await repository.saveDraft('2026-08-16', '초안 2');

    expect(rows).toHaveLength(1);
    await expect(repository.getDraft('2026-08-16')).resolves.toBe('초안 2');
  });

  it('clears a draft', async () => {
    const { db, rows } = createFakeDb();
    const repository = new SQLiteDailyReflectionDraftRepository(db as never, () => '2026-08-16T09:00:00.000Z');
    await repository.saveDraft('2026-08-16', '초안');

    await repository.clearDraft('2026-08-16');

    expect(rows).toHaveLength(0);
    await expect(repository.getDraft('2026-08-16')).resolves.toBeNull();
  });
});
