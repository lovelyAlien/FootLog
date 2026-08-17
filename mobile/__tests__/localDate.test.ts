import { formatLocalDate, localDateAndTimezone } from '../src/shared/localDate';

describe('formatLocalDate', () => {
  it('formats a UTC instant as YYYY-MM-DD in the given timezone', () => {
    // 2026-08-14T23:30:00Z + 9h(Asia/Seoul) = 2026-08-15 local
    const date = new Date('2026-08-14T23:30:00.000Z');
    expect(formatLocalDate(date, 'Asia/Seoul')).toBe('2026-08-15');
  });

  it('rolls back a day when the timezone offset is negative', () => {
    // 2026-08-15T02:00:00Z - 5h(America/New_York) = 2026-08-14 local
    const date = new Date('2026-08-15T02:00:00.000Z');
    expect(formatLocalDate(date, 'America/New_York')).toBe('2026-08-14');
  });
});

describe('localDateAndTimezone', () => {
  it('returns a YYYY-MM-DD local date and a non-empty IANA timezone for the given instant', () => {
    const result = localDateAndTimezone(new Date('2026-08-16T12:00:00.000Z'));

    expect(result.localDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(result.timezone.length).toBeGreaterThan(0);
  });
});
