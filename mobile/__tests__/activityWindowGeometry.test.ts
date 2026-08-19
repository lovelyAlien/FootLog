import {
  clampEndHour,
  clampStartHour,
  hourFromOffset,
  offsetFromHour,
} from '../src/features/notifications/activityWindowGeometry';

describe('hourFromOffset', () => {
  it('maps a track offset to the nearest hour across 0-23', () => {
    expect(hourFromOffset(0, 230)).toBe(0);
    expect(hourFromOffset(230, 230)).toBe(23);
    expect(hourFromOffset(115, 230)).toBe(12);
  });

  it('clamps offsets outside the track to the nearest valid hour', () => {
    expect(hourFromOffset(-20, 230)).toBe(0);
    expect(hourFromOffset(300, 230)).toBe(23);
  });

  it('returns 0 when the track has not been measured yet', () => {
    expect(hourFromOffset(50, 0)).toBe(0);
  });
});

describe('offsetFromHour', () => {
  it('is the inverse of hourFromOffset at whole-hour boundaries', () => {
    expect(offsetFromHour(0, 230)).toBe(0);
    expect(offsetFromHour(23, 230)).toBe(230);
    expect(offsetFromHour(12, 230)).toBeCloseTo(120, 0);
  });
});

describe('clampStartHour', () => {
  it('keeps the start hour at least one hour before the end hour', () => {
    expect(clampStartHour(10, 23)).toBe(10);
    expect(clampStartHour(23, 10)).toBe(9);
    expect(clampStartHour(9, 10)).toBe(9);
  });
});

describe('clampEndHour', () => {
  it('keeps the end hour at least one hour after the start hour', () => {
    expect(clampEndHour(15, 7)).toBe(15);
    expect(clampEndHour(3, 7)).toBe(8);
    expect(clampEndHour(8, 7)).toBe(8);
  });
});
