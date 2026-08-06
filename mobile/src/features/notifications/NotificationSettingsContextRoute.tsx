import { NotificationSettingsScreen } from './NotificationSettingsScreen';
import { useNotificationSettingsDependencies } from './NotificationSettingsContext';

export function NotificationSettingsContextRoute() {
  const dependencies = useNotificationSettingsDependencies();
  return <NotificationSettingsScreen {...dependencies} />;
}
