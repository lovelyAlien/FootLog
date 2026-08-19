import { formatHour } from '../src/features/notifications/formatHour';

describe('formatHour', () => {
  it.each([
    [0, '00:00'],
    [7, '07:00'],
    [23, '23:00'],
  ])('formats %i as %s', (hour, expected) => {
    expect(formatHour(hour)).toBe(expected);
  });
});
