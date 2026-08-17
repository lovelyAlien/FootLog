export type GeoPoint = {
  latitude: number;
  longitude: number;
};

const EARTH_RADIUS_METERS = 6371000;

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

export function haversineDistanceMeters(a: GeoPoint, b: GeoPoint): number {
  const deltaLatitude = toRadians(b.latitude - a.latitude);
  const deltaLongitude = toRadians(b.longitude - a.longitude);
  const latitudeA = toRadians(a.latitude);
  const latitudeB = toRadians(b.latitude);

  const sinDeltaLatitude = Math.sin(deltaLatitude / 2);
  const sinDeltaLongitude = Math.sin(deltaLongitude / 2);

  const h = sinDeltaLatitude * sinDeltaLatitude
    + Math.cos(latitudeA) * Math.cos(latitudeB) * sinDeltaLongitude * sinDeltaLongitude;

  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(h));
}

export function clusterByProximity<T extends GeoPoint>(points: T[], thresholdMeters: number): T[][] {
  const clusters: T[][] = [];

  for (const point of points) {
    const currentCluster = clusters[clusters.length - 1];
    const previousPoint = currentCluster?.[currentCluster.length - 1];

    if (previousPoint && haversineDistanceMeters(previousPoint, point) <= thresholdMeters) {
      currentCluster.push(point);
    } else {
      clusters.push([point]);
    }
  }

  return clusters;
}
