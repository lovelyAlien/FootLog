export type ActivityWindow = {
  startHour: number;
  endHour: number;
};

type BuildHourlyCheckInTimesOptions = {
  now: Date;
  window: ActivityWindow;
  intervalHours: number;
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

function assertValidWindow(window: ActivityWindow): void {
  if (
    !Number.isInteger(window.startHour)
    || !Number.isInteger(window.endHour)
    || window.startHour < 0
    || window.endHour > 23
    || window.startHour >= window.endHour
  ) {
    throw new RangeError('startHour must be earlier than endHour');
  }
}

function assertValidInterval(intervalHours: number): void {
  if (intervalHours !== 1 && intervalHours !== 2 && intervalHours !== 3) {
    throw new RangeError('intervalHours must be 1, 2, or 3');
  }
}

export function buildHourlyCheckInTimes({
  now,
  window,
  intervalHours,
  days,
}: BuildHourlyCheckInTimesOptions): Date[] {
  assertValidWindow(window);
  assertValidInterval(intervalHours);

  if (!Number.isInteger(days) || days < 1) {
    throw new RangeError('days must be a positive integer');
  }

  const times: Date[] = [];

  for (let dayOffset = 0; dayOffset < days; dayOffset += 1) {
    for (let hour = window.startHour; hour <= window.endHour; hour += intervalHours) {
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

export function countScheduledNotificationsPerDay(window: ActivityWindow, intervalHours: number): number {
  assertValidWindow(window);
  assertValidInterval(intervalHours);

  return Math.floor((window.endHour - window.startHour) / intervalHours) + 1;
}
