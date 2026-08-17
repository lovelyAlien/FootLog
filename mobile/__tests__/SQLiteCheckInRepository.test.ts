import { SQLiteCheckInRepository } from '../src/features/check-in/SQLiteCheckInRepository';
import type { CheckIn } from '../src/features/check-in/domain';

type CheckInRow = {
  id: string;
  checked_in_at: string;
  captured_at: string;
  latitude: number;
  longitude: number;
  accuracy_m: number;
  created_at: string;
  sync_status: 'pending';
};

function rowFor(checkIn: CheckIn): CheckInRow {
  return {
    id: checkIn.id,
    checked_in_at: checkIn.checkedInAt,
    captured_at: checkIn.capturedAt,
    latitude: checkIn.latitude,
    longitude: checkIn.longitude,
    accuracy_m: checkIn.accuracyM,
    created_at: checkIn.createdAt,
    sync_status: checkIn.syncStatus,
  };
}

describe('SQLiteCheckInRepository', () => {
  it('lists check-ins within the local-day UTC boundaries in chronological order', async () => {
    const first: CheckIn = {
      id: 'before-midnight',
      checkedInAt: '2026-08-05T15:00:00.000Z',
      capturedAt: '2026-08-05T14:59:58.000Z',
      latitude: 37.5,
      longitude: 127.0,
      accuracyM: 4,
      createdAt: '2026-08-05T15:00:00.000Z',
      syncStatus: 'pending',
    };
    const second: CheckIn = {
      id: 'end-of-day',
      checkedInAt: '2026-08-06T14:59:59.999Z',
      capturedAt: '2026-08-06T14:59:58.000Z',
      latitude: 37.6,
      longitude: 127.1,
      accuracyM: 5,
      createdAt: '2026-08-06T14:59:59.999Z',
      syncStatus: 'pending',
    };
    const rows: CheckInRow[] = [];
    const db = {
      getFirstAsync: jest.fn(),
      execAsync: jest.fn(),
      withTransactionAsync: jest.fn(),
      runAsync: jest.fn(async (sql: string, ...params: unknown[]) => {
        if (sql.includes('INSERT INTO check_ins')) {
          rows.push({
            id: params[0] as string,
            checked_in_at: params[1] as string,
            captured_at: params[2] as string,
            latitude: params[3] as number,
            longitude: params[4] as number,
            accuracy_m: params[5] as number,
            created_at: params[6] as string,
            sync_status: params[7] as 'pending',
          });
        }
        return { changes: 1, lastInsertRowId: 0 };
      }),
      getAllAsync: jest.fn(async (_sql: string, start: string, end: string) =>
        rows
          .filter((row) => row.checked_in_at >= start && row.checked_in_at < end)
          .sort((a, b) => a.checked_in_at.localeCompare(b.checked_in_at)),
      ),
    };
    const repository = new SQLiteCheckInRepository(db as never);

    await repository.save(second);
    await repository.save(first);

    await expect(repository.listByLocalDay('2026-08-06', 'Asia/Seoul')).resolves.toEqual([
      first,
      second,
    ]);
    expect(db.getAllAsync).toHaveBeenCalledWith(
      expect.stringContaining('ORDER BY checked_in_at ASC'),
      '2026-08-05T15:00:00.000Z',
      '2026-08-06T15:00:00.000Z',
    );
  });

  it('deletes only the check-in with the requested id', async () => {
    const rows: CheckInRow[] = [
      rowFor({
        id: 'keep',
        checkedInAt: '2026-08-06T00:00:00.000Z',
        capturedAt: '2026-08-06T00:00:00.000Z',
        latitude: 37.5,
        longitude: 127.0,
        accuracyM: 3,
        createdAt: '2026-08-06T00:00:00.000Z',
        syncStatus: 'pending',
      }),
      rowFor({
        id: 'remove',
        checkedInAt: '2026-08-06T01:00:00.000Z',
        capturedAt: '2026-08-06T01:00:00.000Z',
        latitude: 37.6,
        longitude: 127.1,
        accuracyM: 3,
        createdAt: '2026-08-06T01:00:00.000Z',
        syncStatus: 'pending',
      }),
    ];
    const db = {
      getFirstAsync: jest.fn(),
      execAsync: jest.fn(),
      withTransactionAsync: jest.fn(),
      runAsync: jest.fn(async (sql: string, id: string) => {
        if (sql.startsWith('DELETE FROM check_ins')) {
          const index = rows.findIndex((row) => row.id === id);
          if (index >= 0) rows.splice(index, 1);
        }
        return { changes: 1, lastInsertRowId: 0 };
      }),
      getAllAsync: jest.fn(),
    };
    const repository = new SQLiteCheckInRepository(db as never);

    await repository.deleteById('remove');

    expect(rows.map((row) => row.id)).toEqual(['keep']);
  });

  it('lists distinct local dates with check-ins for the given month', async () => {
    const rows: CheckInRow[] = [
      rowFor({
        id: 'a', checkedInAt: '2026-07-31T15:00:00.000Z', capturedAt: '2026-07-31T15:00:00.000Z',
        latitude: 37.5, longitude: 127.0, accuracyM: 3, createdAt: '2026-07-31T15:00:00.000Z', syncStatus: 'pending',
      }), // 2026-08-01 00:00 in Asia/Seoul
      rowFor({
        id: 'b', checkedInAt: '2026-08-01T01:00:00.000Z', capturedAt: '2026-08-01T01:00:00.000Z',
        latitude: 37.5, longitude: 127.0, accuracyM: 3, createdAt: '2026-08-01T01:00:00.000Z', syncStatus: 'pending',
      }), // 2026-08-01 10:00 in Asia/Seoul, same local date as a
      rowFor({
        id: 'c', checkedInAt: '2026-08-14T23:30:00.000Z', capturedAt: '2026-08-14T23:30:00.000Z',
        latitude: 37.5, longitude: 127.0, accuracyM: 3, createdAt: '2026-08-14T23:30:00.000Z', syncStatus: 'pending',
      }), // 2026-08-15 08:30 in Asia/Seoul
    ];
    const db = {
      getFirstAsync: jest.fn(),
      execAsync: jest.fn(),
      withTransactionAsync: jest.fn(),
      runAsync: jest.fn(),
      getAllAsync: jest.fn(async (_sql: string, start: string, end: string) =>
        rows
          .filter((row) => row.checked_in_at >= start && row.checked_in_at < end)
          .sort((a, b) => a.checked_in_at.localeCompare(b.checked_in_at)),
      ),
    };
    const repository = new SQLiteCheckInRepository(db as never);

    await expect(repository.listLocalDatesWithCheckIns(2026, 8, 'Asia/Seoul')).resolves.toEqual([
      '2026-08-01',
      '2026-08-15',
    ]);
  });
});
