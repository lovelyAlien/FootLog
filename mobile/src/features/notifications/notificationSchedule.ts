export type ActivityWindow = {
  startHour: number;
  endHour: number;
};

type BuildHourlyCheckInTimesOptions = {
  now: Date;
  window: ActivityWindow;
  days: number;
};

const constructDateFrom = Symbol.for('constructDateFrom');

type ConstructableDate = Date & {
  [constructDateFrom]?: (value: Date | number | string) => Date;
};

function cloneDate(date: Date): Date {
  const construct = (date as ConstructableDate)[constructDateFrom];
  return construct ? construct.call(date, date.getTime()) : new Date(date.getTime());
}

export function buildHourlyCheckInTimes({
  now,
  window,
  days,
}: BuildHourlyCheckInTimesOptions): Date[] {
  if (
    !Number.isInteger(window.startHour)
    || !Number.isInteger(window.endHour)
    || window.startHour < 0
    || window.endHour > 23
    || window.startHour >= window.endHour
  ) {
    throw new RangeError('startHour must be earlier than endHour');
  }

  if (!Number.isInteger(days) || days < 1) {
    throw new RangeError('days must be a positive integer');
  }

  const times: Date[] = [];

  for (let dayOffset = 0; dayOffset < days; dayOffset += 1) {
    for (let hour = window.startHour; hour <= window.endHour; hour += 1) {
      const candidate = cloneDate(now);
      candidate.setDate(now.getDate() + dayOffset);
      candidate.setHours(hour, 0, 0, 0);

      // A daylight-saving transition can make a local clock hour nonexistent.
      if (candidate.getHours() === hour && candidate.getTime() >= now.getTime()) {
        times.push(candidate);
      }
    }
  }

  return times.sort((left, right) => left.getTime() - right.getTime());
}
