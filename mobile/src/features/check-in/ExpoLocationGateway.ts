import * as Location from 'expo-location';

import type { LocationFix, LocationGateway } from './domain';
import { LocationFixError } from './domain';

export class ExpoLocationGateway implements LocationGateway {
  async requestForegroundPermission(): Promise<'granted' | 'denied'> {
    const permission = await Location.requestForegroundPermissionsAsync();
    return permission.status === 'granted' ? 'granted' : 'denied';
  }

  async getCurrentFix(): Promise<LocationFix> {
    const location = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Highest,
    });
    const { latitude, longitude, accuracy } = location.coords;
    const capturedAt = new Date(location.timestamp);

    if (
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude) ||
      accuracy === null ||
      !Number.isFinite(accuracy) ||
      accuracy < 0 ||
      !Number.isFinite(location.timestamp) ||
      Number.isNaN(capturedAt.getTime())
    ) {
      throw new LocationFixError('Invalid location fix');
    }

    return {
      latitude,
      longitude,
      accuracyM: accuracy,
      capturedAt: capturedAt.toISOString(),
    };
  }
}
