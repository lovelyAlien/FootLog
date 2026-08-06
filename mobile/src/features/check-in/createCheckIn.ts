import type { CheckIn, CheckInRepository, LocationFix } from './domain';

type Dependencies = {
  repository: CheckInRepository;
  uuid: () => string;
  now: () => string;
};

export async function createCheckIn(fix: LocationFix, deps: Dependencies): Promise<CheckIn> {
  const now = deps.now();
  const checkIn: CheckIn = {
    ...fix,
    id: deps.uuid(),
    checkedInAt: now,
    createdAt: now,
    syncStatus: 'pending',
  };
  await deps.repository.save(checkIn);
  return checkIn;
}
