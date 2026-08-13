import { createContext, useContext, type PropsWithChildren } from 'react';

import type { NotificationSettingsRepository } from '../settings/AppSettingsRepository';
import type { NotificationScheduler } from './ExpoNotificationScheduler';

export type NotificationSettingsDependencies = {
  repository: NotificationSettingsRepository;
  scheduler: NotificationScheduler;
};

const NotificationSettingsContext = createContext<NotificationSettingsDependencies | null>(null);

export function NotificationSettingsProvider({
  value,
  children,
}: PropsWithChildren<{ value: NotificationSettingsDependencies }>) {
  return (
    <NotificationSettingsContext.Provider value={value}>
      {children}
    </NotificationSettingsContext.Provider>
  );
}

export function useNotificationSettingsDependencies(): NotificationSettingsDependencies {
  const dependencies = useContext(NotificationSettingsContext);
  if (!dependencies) {
    throw new Error('Notification settings are unavailable before database initialization.');
  }
  return dependencies;
}
