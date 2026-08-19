import type { CheckIn, LocationFix } from './domain';

export type MapRegion = {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
};

const REGION_DELTA = 0.02;

const SEOUL_CITY_HALL_DEFAULT: MapRegion = {
  latitude: 37.5665,
  longitude: 126.978,
  latitudeDelta: REGION_DELTA,
  longitudeDelta: REGION_DELTA,
};

export function resolveInitialMapRegion(locationFix: LocationFix | null, checkIns: CheckIn[]): MapRegion {
  if (locationFix) {
    return {
      latitude: locationFix.latitude,
      longitude: locationFix.longitude,
      latitudeDelta: REGION_DELTA,
      longitudeDelta: REGION_DELTA,
    };
  }

  if (checkIns.length > 0) {
    const mostRecent = [...checkIns].sort(
      (left, right) => Date.parse(right.checkedInAt) - Date.parse(left.checkedInAt),
    )[0];
    return {
      latitude: mostRecent.latitude,
      longitude: mostRecent.longitude,
      latitudeDelta: REGION_DELTA,
      longitudeDelta: REGION_DELTA,
    };
  }

  return SEOUL_CITY_HALL_DEFAULT;
}
