export function formatHour(hour: number): string {
  return `${hour.toString().padStart(2, '0')}:00`;
}
