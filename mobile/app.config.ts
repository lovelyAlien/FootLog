import type { ExpoConfig } from 'expo/config';

const config: ExpoConfig = {
  name: 'FootLog',
  slug: 'footlog',
  scheme: 'footlog',
  version: '0.1.0',
  orientation: 'portrait',
  ios: {
    bundleIdentifier: 'com.footlog.app',
    supportsTablet: false,
    infoPlist: {
      NSLocationWhenInUseUsageDescription:
        '체크인할 현재 위치를 확인하기 위해 위치 권한이 필요합니다.',
    },
  },
  android: {
    package: 'com.footlog.app',
    permissions: ['ACCESS_COARSE_LOCATION', 'ACCESS_FINE_LOCATION'],
  },
  plugins: [
    'expo-router',
    'expo-dev-client',
    [
      'expo-location',
      {
        locationAlwaysAndWhenInUsePermission: false,
        locationAlwaysPermission: false,
        locationWhenInUsePermission:
          '체크인할 현재 위치를 확인하기 위해 위치 권한이 필요합니다.',
        isIosBackgroundLocationEnabled: false,
        isAndroidBackgroundLocationEnabled: false,
      },
    ],
    ['expo-notifications', { defaultChannel: 'hourly-check-ins' }],
  ],
  experiments: { typedRoutes: true },
  extra: {
    eas: {
      projectId: 'ef0f4f2b-e9b8-4aa2-90e8-b6f622aa3efa',
    },
  },
};

export default config;
