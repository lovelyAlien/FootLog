import { createContext, useContext } from 'react';

import type { CheckInRepository } from '../features/check-in/domain';

const FootLogRepositoryContext = createContext<CheckInRepository | null>(null);

export const FootLogRepositoryProvider = FootLogRepositoryContext.Provider;

export function useFootLogRepository(): CheckInRepository {
  const repository = useContext(FootLogRepositoryContext);

  if (!repository) {
    throw new Error('FootLog repository is unavailable before database initialization.');
  }

  return repository;
}
