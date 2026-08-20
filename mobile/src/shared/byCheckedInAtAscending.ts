import type { CheckIn } from '../features/check-in/domain';

export function byCheckedInAtAscending(a: CheckIn, b: CheckIn): number {
  return Date.parse(a.checkedInAt) - Date.parse(b.checkedInAt);
}
