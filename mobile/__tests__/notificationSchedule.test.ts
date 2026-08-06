import { TZDate } from '@date-fns/tz';

import { buildHourlyCheckInTimes } from '../src/features/notifications/notificationSchedule';

describe('buildHourlyCheckInTimes', () => {
  it('returns every remaining whole activity hour across the requested local calendar days', () => {
    const times = buildHourlyCheckInTimes({
      now: new Date('2026-08-06T08:32:00+09:00'),
      window: { startHour: 7, endHour: 23 },
      days: 2,
    });

    expect(times.map((time) => `${time.getDate()} ${time.getHours()}:00`)).toEqual([
      ...Array.from({ length: 15 }, (_, index) => `6 ${index + 9}:00`),
      ...Array.from({ length: 17 }, (_, index) => `7 ${index + 7}:00`),
    ]);
    expect(times.every((time) => time.getTime() >= new Date('2026-08-06T08:32:00+09:00').getTime())).toBe(true);
  });

  it('includes the current hour when now is exactly on the hour', () => {
    const now = new Date('2026-08-06T09:00:00+09:00');

    const times = buildHourlyCheckInTimes({
      now,
      window: { startHour: 7, endHour: 10 },
      days: 1,
    });

    expect(times.map((time) => time.toISOString())).toEqual([
      '2026-08-06T00:00:00.000Z',
      '2026-08-06T01:00:00.000Z',
    ]);
  });

  it('builds the next day from calendar components when the timezone offset changes', () => {
    const now = new TZDate(2026, 2, 7, 6, 30, 'America/New_York');

    const times = buildHourlyCheckInTimes({
      now,
      window: { startHour: 7, endHour: 8 },
      days: 2,
    });

    expect(times.map((time) => new Date(time.getTime()).toISOString())).toEqual([
      '2026-03-07T12:00:00.000Z',
      '2026-03-07T13:00:00.000Z',
      '2026-03-08T11:00:00.000Z',
      '2026-03-08T12:00:00.000Z',
    ]);
    expect(times[2].getTime() - times[0].getTime()).toBe(23 * 60 * 60 * 1000);
  });

  it.each([
    { startHour: 23, endHour: 7 },
    { startHour: 7, endHour: 7 },
  ])('rejects an unsupported activity window $startHour-$endHour', (window) => {
    expect(() => buildHourlyCheckInTimes({ now: new Date(), window, days: 2 })).toThrow(
      'startHour must be earlier than endHour',
    );
  });
});
