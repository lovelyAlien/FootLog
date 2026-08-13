import { TZDate } from '@date-fns/tz';
import type { SQLiteDatabase } from 'expo-sqlite';

import type { CheckIn, CheckInRepository } from './domain';

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

const INSERT_CHECK_IN = `
INSERT INTO check_ins (
  id, checked_in_at, captured_at, latitude, longitude, accuracy_m, created_at, sync_status
) VALUES (?, ?, ?, ?, ?, ?, ?, ?);
`;

const SELECT_BY_LOCAL_DAY = `
SELECT * FROM check_ins
WHERE checked_in_at >= ? AND checked_in_at < ?
ORDER BY checked_in_at ASC;
`;

function localDayBounds(localDate: string, timezone: string): [string, string] {
  const [year, month, day] = localDate.split('-').map(Number);
  const start = new TZDate(year, month - 1, day, timezone);
  const end = new TZDate(year, month - 1, day + 1, timezone);

  return [
    new Date(start.getTime()).toISOString(),
    new Date(end.getTime()).toISOString(),
  ];
}

function toCheckIn(row: CheckInRow): CheckIn {
  return {
    id: row.id,
    checkedInAt: row.checked_in_at,
    capturedAt: row.captured_at,
    latitude: row.latitude,
    longitude: row.longitude,
    accuracyM: row.accuracy_m,
    createdAt: row.created_at,
    syncStatus: row.sync_status,
  };
}

export class SQLiteCheckInRepository implements CheckInRepository {
  constructor(private readonly db: SQLiteDatabase) {}

  async save(checkIn: CheckIn): Promise<void> {
    await this.db.runAsync(
      INSERT_CHECK_IN,
      checkIn.id,
      checkIn.checkedInAt,
      checkIn.capturedAt,
      checkIn.latitude,
      checkIn.longitude,
      checkIn.accuracyM,
      checkIn.createdAt,
      checkIn.syncStatus,
    );
  }

  async listByLocalDay(localDate: string, timezone: string): Promise<CheckIn[]> {
    const [start, end] = localDayBounds(localDate, timezone);
    const rows = await this.db.getAllAsync<CheckInRow>(SELECT_BY_LOCAL_DAY, start, end);

    return rows.map(toCheckIn);
  }

  async deleteById(id: string): Promise<void> {
    await this.db.runAsync('DELETE FROM check_ins WHERE id = ?;', id);
  }
}
