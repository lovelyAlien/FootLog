import { useCallback, useEffect, useState } from 'react';

import { useFootLogRepository } from '../../database/FootLogContext';
import { useNotificationSettingsDependencies } from '../notifications/NotificationSettingsContext';
import { localDateAndTimezone } from '../../shared/localDate';
import type { CheckIn } from '../check-in/domain';
import { useDailyReflectionDependencies } from './DailyReflectionContext';
import type { DailyReflection } from './domain';

export type DailyDetailState =
  | { status: 'loading' }
  | { status: 'error' }
  | {
      status: 'loaded';
      checkIns: CheckIn[];
      reflection: DailyReflection | null;
      draft: string | null;
      activityWindow: { startHour: number; endHour: number };
    };

export type UseDailyDetailResult = {
  state: DailyDetailState;
  reload: () => void;
};

export function useDailyDetail(localDate: string): UseDailyDetailResult {
  const checkInRepository = useFootLogRepository();
  const { reflectionRepository, draftRepository } = useDailyReflectionDependencies();
  const { repository: notificationSettingsRepository } = useNotificationSettingsDependencies();
  const [state, setState] = useState<DailyDetailState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  const load = useCallback(() => {
    let isCurrent = true;
    void Promise.resolve().then(() => {
      if (isCurrent) setState({ status: 'loading' });
    });
    const { timezone } = localDateAndTimezone();

    void Promise.all([
      checkInRepository.listByLocalDay(localDate, timezone),
      reflectionRepository.getByLocalDate(localDate),
      draftRepository.getDraft(localDate),
      notificationSettingsRepository.getNotificationSettings(),
    ])
      .then(([checkIns, reflection, draft, notificationSettings]) => {
        if (!isCurrent) return;
        setState({
          status: 'loaded',
          checkIns,
          reflection,
          draft,
          activityWindow: { startHour: notificationSettings.startHour, endHour: notificationSettings.endHour },
        });
      })
      .catch(() => {
        if (isCurrent) setState({ status: 'error' });
      });

    return () => { isCurrent = false; };
  }, [checkInRepository, reflectionRepository, draftRepository, notificationSettingsRepository, localDate]);

  useEffect(() => load(), [load, attempt]);

  return { state, reload: () => setAttempt((value) => value + 1) };
}
