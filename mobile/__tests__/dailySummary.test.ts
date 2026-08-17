import { computeDailySummary } from '../src/features/daily-reflection/dailySummary';
import type { CheckIn } from '../src/features/check-in/domain';

const METERS_PER_DEGREE_LATITUDE = 111194.9266;

function buildCheckIn(overrides: Partial<CheckIn> & Pick<CheckIn, 'id' | 'checkedInAt'>): CheckIn {
  return {
    latitude: 37.0,
    longitude: 127.0,
    accuracyM: 10,
    capturedAt: overrides.checkedInAt,
    createdAt: overrides.checkedInAt,
    syncStatus: 'pending',
    ...overrides,
  };
}

describe('computeDailySummary', () => {
  it('returns a zeroed-out summary for no check-ins', () => {
    expect(computeDailySummary([])).toEqual({
      checkInCount: 0,
      firstCheckedInAt: null,
      lastCheckedInAt: null,
      approximateDistanceMeters: 0,
      longestConsecutiveArea: null,
    });
  });

  it('treats a single check-in as its own zero-length area with zero distance', () => {
    const only = buildCheckIn({ id: 'only', checkedInAt: '2026-08-16T09:00:00.000Z' });

    expect(computeDailySummary([only])).toEqual({
      checkInCount: 1,
      firstCheckedInAt: '2026-08-16T09:00:00.000Z',
      lastCheckedInAt: '2026-08-16T09:00:00.000Z',
      approximateDistanceMeters: 0,
      longestConsecutiveArea: { startedAt: '2026-08-16T09:00:00.000Z', endedAt: '2026-08-16T09:00:00.000Z', checkInIds: ['only'] },
    });
  });

  it('picks the longest-duration cluster among several, and sums the point-to-point distance', () => {
    // Latitude-only offsets from 37.0 (longitude fixed at 127.0) give exact,
    // hand-verifiable distances: distance = degreesOfLatitude * METERS_PER_DEGREE_LATITUDE.
    const c1 = buildCheckIn({ id: 'c1', checkedInAt: '2026-08-16T07:00:00.000Z', latitude: 37.0 });
    const c2 = buildCheckIn({ id: 'c2', checkedInAt: '2026-08-16T09:00:00.000Z', latitude: 37.02 }); // ~2223.9m from c1
    const c3 = buildCheckIn({ id: 'c3', checkedInAt: '2026-08-16T10:00:00.000Z', latitude: 37.0205 }); // ~55.6m from c2
    const c4 = buildCheckIn({ id: 'c4', checkedInAt: '2026-08-16T11:00:00.000Z', latitude: 37.021 }); // ~55.6m from c3
    const c5 = buildCheckIn({ id: 'c5', checkedInAt: '2026-08-16T12:00:00.000Z', latitude: 37.0211 }); // ~11.1m from c4
    const c6 = buildCheckIn({ id: 'c6', checkedInAt: '2026-08-16T15:00:00.000Z', latitude: 37.0311 }); // ~1111.9m from c5
    const c7 = buildCheckIn({ id: 'c7', checkedInAt: '2026-08-16T18:00:00.000Z', latitude: 37.0391 }); // ~889.6m from c6

    const summary = computeDailySummary([c1, c2, c3, c4, c5, c6, c7]);

    expect(summary.checkInCount).toBe(7);
    expect(summary.firstCheckedInAt).toBe('2026-08-16T07:00:00.000Z');
    expect(summary.lastCheckedInAt).toBe('2026-08-16T18:00:00.000Z');
    expect(summary.longestConsecutiveArea).toEqual({
      startedAt: '2026-08-16T09:00:00.000Z',
      endedAt: '2026-08-16T12:00:00.000Z',
      checkInIds: ['c2', 'c3', 'c4', 'c5'],
    });
    expect(Math.abs(summary.approximateDistanceMeters - 4347.72)).toBeLessThan(10);
  });

  it('excludes check-ins with accuracy over 200m from clustering, but keeps them in the count', () => {
    const c1 = buildCheckIn({ id: 'c1', checkedInAt: '2026-08-16T07:00:00.000Z', latitude: 37.0, accuracyM: 10 });
    const c2 = buildCheckIn({ id: 'c2', checkedInAt: '2026-08-16T08:00:00.000Z', latitude: 37.0005, accuracyM: 250 }); // excluded: accuracy > 200
    const c3 = buildCheckIn({ id: 'c3', checkedInAt: '2026-08-16T09:00:00.000Z', latitude: 37.001, accuracyM: 10 }); // ~111.2m from c1 once c2 is skipped

    const summary = computeDailySummary([c1, c2, c3]);

    expect(summary.checkInCount).toBe(3);
    expect(summary.longestConsecutiveArea).toEqual({
      startedAt: '2026-08-16T07:00:00.000Z',
      endedAt: '2026-08-16T09:00:00.000Z',
      checkInIds: ['c1', 'c3'],
    });
  });
});
