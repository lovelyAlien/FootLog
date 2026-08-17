export function formatLocalDate(date: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return `${values.year}-${values.month}-${values.day}`;
}

export function localDateAndTimezone(now: Date = new Date()): { localDate: string; timezone: string } {
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

  return { localDate: formatLocalDate(now, timezone), timezone };
}
