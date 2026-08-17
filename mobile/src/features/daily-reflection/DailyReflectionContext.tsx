import { createContext, useContext, type PropsWithChildren } from 'react';

import type { DailyReflectionDraftRepository, DailyReflectionRepository } from './domain';

export type DailyReflectionDependencies = {
  reflectionRepository: DailyReflectionRepository;
  draftRepository: DailyReflectionDraftRepository;
  uuid: () => string;
  now: () => string;
};

const DailyReflectionContext = createContext<DailyReflectionDependencies | null>(null);

export function DailyReflectionProvider({
  value,
  children,
}: PropsWithChildren<{ value: DailyReflectionDependencies }>) {
  return (
    <DailyReflectionContext.Provider value={value}>
      {children}
    </DailyReflectionContext.Provider>
  );
}

export function useDailyReflectionDependencies(): DailyReflectionDependencies {
  const dependencies = useContext(DailyReflectionContext);
  if (!dependencies) {
    throw new Error('Daily reflection dependencies are unavailable before database initialization.');
  }
  return dependencies;
}
