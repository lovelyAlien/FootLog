import { getConfig } from '@expo/config';
import { compileModsAsync } from '@expo/config-plugins';
import { getRouterDirectory } from '@expo/metro-config/build/rewriteRequestUrl';

describe('Expo Router entry', () => {
  it('bundles the FootLog routes from the app directory', () => {
    expect(getRouterDirectory(process.cwd())).toBe('app');
  });
});

describe('Expo native permission config', () => {
  it('generates iOS config without Always location descriptions or background location mode', async () => {
    const projectRoot = '.';
    const { exp } = getConfig(projectRoot, { isModdedConfig: true });
    const compiled = await compileModsAsync(exp, {
      projectRoot,
      platforms: ['ios'],
      introspect: true,
      ignoreExistingNativeFiles: true,
    });
    const infoPlist = compiled._internal?.modResults?.ios?.infoPlist as Record<string, unknown>;
    const backgroundModes = Array.isArray(infoPlist.UIBackgroundModes)
      ? infoPlist.UIBackgroundModes
      : [];

    expect(infoPlist.NSLocationWhenInUseUsageDescription).toBe(
      '체크인할 현재 위치를 확인하기 위해 위치 권한이 필요합니다.',
    );
    expect(infoPlist).not.toHaveProperty('NSLocationAlwaysUsageDescription');
    expect(infoPlist).not.toHaveProperty('NSLocationAlwaysAndWhenInUseUsageDescription');
    expect(backgroundModes).not.toContain('location');
  });
});
