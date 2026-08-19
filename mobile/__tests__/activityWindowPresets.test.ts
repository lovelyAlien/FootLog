import { ACTIVITY_WINDOW_PRESETS, matchPreset } from '../src/features/notifications/activityWindowPresets';

describe('ACTIVITY_WINDOW_PRESETS', () => {
  it('only contains same-day windows (no midnight crossing)', () => {
    for (const preset of ACTIVITY_WINDOW_PRESETS) {
      expect(preset.startHour).toBeLessThan(preset.endHour);
    }
  });

  it('exposes the three presets from the design doc', () => {
    expect(ACTIVITY_WINDOW_PRESETS).toEqual([
      { id: 'commute', label: '출근형', startHour: 7, endHour: 22 },
      { id: 'free', label: '자유형', startHour: 9, endHour: 23 },
      { id: 'morning', label: '아침형', startHour: 5, endHour: 20 },
    ]);
  });
});

describe('matchPreset', () => {
  it('returns the preset id when the window matches exactly', () => {
    expect(matchPreset(7, 22)).toBe('commute');
    expect(matchPreset(9, 23)).toBe('free');
  });

  it('returns null when the window does not match any preset', () => {
    expect(matchPreset(8, 22)).toBeNull();
    expect(matchPreset(0, 23)).toBeNull();
  });
});
