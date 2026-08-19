const MAX_HOUR = 23;
const MIN_HOUR = 0;

export function hourFromOffset(offsetX: number, trackWidth: number): number {
  if (trackWidth <= 0) return 0;
  const ratio = Math.min(1, Math.max(0, offsetX / trackWidth));
  return Math.round(ratio * MAX_HOUR);
}

export function offsetFromHour(hour: number, trackWidth: number): number {
  return (hour / MAX_HOUR) * trackWidth;
}

export function clampStartHour(candidateHour: number, endHour: number): number {
  return Math.min(Math.max(MIN_HOUR, candidateHour), endHour - 1);
}

export function clampEndHour(candidateHour: number, startHour: number): number {
  return Math.max(Math.min(MAX_HOUR, candidateHour), startHour + 1);
}
