import { formatLocalTime } from '../src/shared/formatLocalTime';

describe('formatLocalTime', () => {
  it('formats an ISO timestamp as 24-hour HH:mm', () => {
    const iso = new Date(2026, 7, 20, 14, 32).toISOString();
    expect(formatLocalTime(iso)).toBe('14:32');
  });

  it('zero-pads single-digit hours and minutes', () => {
    const iso = new Date(2026, 7, 20, 0, 55).toISOString();
    expect(formatLocalTime(iso)).toBe('00:55');
  });
});
