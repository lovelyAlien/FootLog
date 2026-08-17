import { SQLiteDailyReflectionRepository } from '../src/features/daily-reflection/SQLiteDailyReflectionRepository';
import type { DailyReflection } from '../src/features/daily-reflection/domain';

type DailyReflectionRow = {
  id: string;
  local_date: string;
  body: string;
  updated_at: string;
};

function createFakeDb() {
  const rows: DailyReflectionRow[] = [];

  const db = {
    getFirstAsync: jest.fn(async (sql: string, localDate: string) => {
      if (sql.includes('SELECT * FROM daily_reflections')) {
        return rows.find((row) => row.local_date === localDate) ?? null;
      }
      return null;
    }),
    runAsync: jest.fn(async (sql: string, ...params: unknown[]) => {
      if (sql.includes('INSERT INTO daily_reflections')) {
        const [id, localDate, body, updatedAt] = params as [string, string, string, string];
        const existingIndex = rows.findIndex((row) => row.local_date === localDate);
        if (existingIndex >= 0) {
          rows[existingIndex] = { ...rows[existingIndex], body, updated_at: updatedAt };
        } else {
          rows.push({ id, local_date: localDate, body, updated_at: updatedAt });
        }
      } else if (sql.startsWith('DELETE FROM daily_reflections')) {
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

describe('SQLiteDailyReflectionRepository', () => {
  it('returns null when no reflection exists for the date', async () => {
    const { db } = createFakeDb();
    const repository = new SQLiteDailyReflectionRepository(db as never);

    await expect(repository.getByLocalDate('2026-08-16')).resolves.toBeNull();
  });

  it('saves a new reflection and reads it back', async () => {
    const { db } = createFakeDb();
    const repository = new SQLiteDailyReflectionRepository(db as never);
    const reflection: DailyReflection = {
      id: 'reflection-1',
      localDate: '2026-08-16',
      body: '오늘은 회사와 집만 왔다갔다 했다.',
      updatedAt: '2026-08-16T12:00:00.000Z',
    };

    await repository.save(reflection);

    await expect(repository.getByLocalDate('2026-08-16')).resolves.toEqual(reflection);
  });

  it('upserts by local_date, keeping a single row on update', async () => {
    const { db, rows } = createFakeDb();
    const repository = new SQLiteDailyReflectionRepository(db as never);

    await repository.save({ id: 'reflection-1', localDate: '2026-08-16', body: '초안', updatedAt: '2026-08-16T09:00:00.000Z' });
    await repository.save({ id: 'a-different-id', localDate: '2026-08-16', body: '수정된 회고', updatedAt: '2026-08-16T20:00:00.000Z' });

    expect(rows).toHaveLength(1);
    const result = await repository.getByLocalDate('2026-08-16');
    expect(result).toEqual({
      id: 'reflection-1',
      localDate: '2026-08-16',
      body: '수정된 회고',
      updatedAt: '2026-08-16T20:00:00.000Z',
    });
    expect(result?.id).toBe('reflection-1');
  });

  it('deletes only the reflection for the requested date', async () => {
    const { db, rows } = createFakeDb();
    const repository = new SQLiteDailyReflectionRepository(db as never);
    await repository.save({ id: 'keep', localDate: '2026-08-15', body: 'a', updatedAt: '2026-08-15T00:00:00.000Z' });
    await repository.save({ id: 'remove', localDate: '2026-08-16', body: 'b', updatedAt: '2026-08-16T00:00:00.000Z' });

    await repository.deleteByLocalDate('2026-08-16');

    expect(rows.map((row) => row.local_date)).toEqual(['2026-08-15']);
  });
});
