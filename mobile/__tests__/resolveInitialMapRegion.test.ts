import { resolveInitialMapRegion } from '../src/features/check-in/resolveInitialMapRegion';
import type { CheckIn, LocationFix } from '../src/features/check-in/domain';

function buildCheckIn(overrides: Partial<CheckIn> & Pick<CheckIn, 'id' | 'checkedInAt'>): CheckIn {
  return {
    latitude: 37.4,
    longitude: 127.1,
    accuracyM: 10,
    capturedAt: overrides.checkedInAt,
    createdAt: overrides.checkedInAt,
    syncStatus: 'pending',
    ...overrides,
  };
}

describe('resolveInitialMapRegion', () => {
  it('centers on the current location fix when available', () => {
    const locationFix: LocationFix = {
      latitude: 37.55, longitude: 127.05, accuracyM: 8, capturedAt: '2026-08-19T00:00:00.000Z',
    };

    expect(resolveInitialMapRegion(locationFix, [])).toEqual({
      latitude: 37.55, longitude: 127.05, latitudeDelta: 0.02, longitudeDelta: 0.02,
    });
  });

  it('falls back to the most recent check-in when there is no location fix', () => {
    const older = buildCheckIn({ id: 'older', checkedInAt: '2026-08-19T01:00:00.000Z' });
    const newer = buildCheckIn({ id: 'newer', checkedInAt: '2026-08-19T05:00:00.000Z', latitude: 37.6, longitude: 127.2 });

    expect(resolveInitialMapRegion(null, [older, newer])).toEqual({
      latitude: 37.6, longitude: 127.2, latitudeDelta: 0.02, longitudeDelta: 0.02,
    });
  });

  it('falls back to the Seoul City Hall default when there is no fix and no check-ins', () => {
    expect(resolveInitialMapRegion(null, [])).toEqual({
      latitude: 37.5665, longitude: 126.978, latitudeDelta: 0.02, longitudeDelta: 0.02,
    });
  });
});
