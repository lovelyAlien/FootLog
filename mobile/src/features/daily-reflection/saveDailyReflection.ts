import type { DailyReflection, DailyReflectionRepository } from './domain';

type Dependencies = {
  repository: DailyReflectionRepository;
  uuid: () => string;
  now: () => string;
};

export async function saveDailyReflection(
  localDate: string,
  body: string,
  deps: Dependencies,
): Promise<DailyReflection> {
  const existing = await deps.repository.getByLocalDate(localDate);
  const reflection: DailyReflection = {
    id: existing?.id ?? deps.uuid(),
    localDate,
    body,
    updatedAt: deps.now(),
  };
  await deps.repository.save(reflection);
  return reflection;
}
