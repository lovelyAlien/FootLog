jest.mock('expo-location', () => ({
  Accuracy: { Highest: 6 },
  requestForegroundPermissionsAsync: jest.fn(),
  getCurrentPositionAsync: jest.fn(),
}));

import * as Location from 'expo-location';

import { ExpoLocationGateway } from '../src/features/check-in/ExpoLocationGateway';
import { LocationFixError } from '../src/features/check-in/domain';

const requestForegroundPermissionsAsync = jest.mocked(Location.requestForegroundPermissionsAsync);
const getCurrentPositionAsync = jest.mocked(Location.getCurrentPositionAsync);

function locationAt(
  overrides: Partial<{ latitude: number; longitude: number; accuracy: number | null; timestamp: number }> = {},
) {
  const { timestamp = 1_785_974_400_000, ...coords } = overrides;

  return {
    coords: {
      latitude: 37.5445,
      longitude: 127.056,
      accuracy: 42,
      altitude: null,
      altitudeAccuracy: null,
      heading: 0,
      speed: 0,
      ...coords,
    },
    timestamp,
    mocked: false,
  };
}

describe('ExpoLocationGateway', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('maps foreground permission denial to denied', async () => {
    requestForegroundPermissionsAsync.mockResolvedValue(
      {
        status: 'denied',
        granted: false,
        canAskAgain: false,
        expires: 'never',
      } as never,
    );

    await expect(new ExpoLocationGateway().requestForegroundPermission()).resolves.toBe('denied');
  });

  it('requests a fresh high-accuracy position rather than last known position', async () => {
    getCurrentPositionAsync.mockResolvedValue(locationAt() as never);

    await new ExpoLocationGateway().getCurrentFix();

    expect(getCurrentPositionAsync).toHaveBeenCalledWith({ accuracy: Location.Accuracy.Highest });
  });

  it.each([null, -1])('rejects %p accuracy as an invalid fix', async (accuracy) => {
    getCurrentPositionAsync.mockResolvedValue(locationAt({ accuracy }) as never);

    await expect(new ExpoLocationGateway().getCurrentFix()).rejects.toBeInstanceOf(LocationFixError);
  });

  it.each([
    ['latitude', { latitude: Number.NaN }],
    ['longitude', { longitude: Number.POSITIVE_INFINITY }],
    ['timestamp', { timestamp: Number.NaN }],
  ])('rejects a non-finite %s as an invalid fix', async (_field, overrides) => {
    getCurrentPositionAsync.mockResolvedValue(locationAt(overrides) as never);

    await expect(new ExpoLocationGateway().getCurrentFix()).rejects.toBeInstanceOf(LocationFixError);
  });

  it('returns ISO capturedAt from the native timestamp', async () => {
    getCurrentPositionAsync.mockResolvedValue(locationAt() as never);

    await expect(new ExpoLocationGateway().getCurrentFix()).resolves.toEqual({
      latitude: 37.5445,
      longitude: 127.056,
      accuracyM: 42,
      capturedAt: '2026-08-06T00:00:00.000Z',
    });
  });
});
