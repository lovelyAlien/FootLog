import { clusterByProximity, haversineDistanceMeters } from '../src/shared/geo';

describe('haversineDistanceMeters', () => {
  it('returns 0 for identical coordinates', () => {
    const point = { latitude: 37.5665, longitude: 126.978 };
    expect(haversineDistanceMeters(point, point)).toBe(0);
  });

  it('returns the exact great-circle distance along a meridian', () => {
    const south = { latitude: 37.0, longitude: 127.0 };
    const north = { latitude: 38.0, longitude: 127.0 };

    const distance = haversineDistanceMeters(south, north);

    expect(Math.abs(distance - 111194.93)).toBeLessThan(1);
  });
});

describe('clusterByProximity', () => {
  it('returns an empty array for no points', () => {
    expect(clusterByProximity([], 200)).toEqual([]);
  });

  it('keeps a single point as its own cluster', () => {
    const point = { latitude: 37.0, longitude: 127.0 };
    expect(clusterByProximity([point], 200)).toEqual([[point]]);
  });

  it('groups points within the threshold and splits on points beyond it', () => {
    const point0 = { latitude: 37.0, longitude: 127.0 };
    const point1 = { latitude: 37.0015, longitude: 127.0 }; // ~166.79m from point0
    const point2 = { latitude: 37.004, longitude: 127.0 }; // ~277.99m from point1
    const point3 = { latitude: 37.005, longitude: 127.0 }; // ~111.19m from point2

    expect(clusterByProximity([point0, point1, point2, point3], 200)).toEqual([
      [point0, point1],
      [point2, point3],
    ]);
  });

  it('treats a point clearly under the threshold as the same cluster and clearly over as a new one', () => {
    // 199m and 201m south of the origin along a meridian — safely on either side of
    // the 200m boundary to avoid floating-point round-trip flakiness at the exact edge.
    const origin = { latitude: 37.0, longitude: 127.0 };
    const under = { latitude: 37.0 - 199 / 111194.9266, longitude: 127.0 };
    const over = { latitude: 37.0 - 201 / 111194.9266, longitude: 127.0 };

    expect(clusterByProximity([origin, under], 200)).toEqual([[origin, under]]);
    expect(clusterByProximity([origin, over], 200)).toEqual([[origin], [over]]);
  });
});
