import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useFootLogRepository } from '../../src/database/FootLogContext';
import { localDateAndTimezone } from '../../src/shared/localDate';
import { colors } from '../../src/shared/theme';
import { TodayMapSheet } from '../../src/features/check-in/TodayMapSheet';
import { ExpoLocationGateway } from '../../src/features/check-in/ExpoLocationGateway';
import { resolveInitialMapRegion, type MapRegion } from '../../src/features/check-in/resolveInitialMapRegion';
import type { CheckIn } from '../../src/features/check-in/domain';

// Location fixes can hang for many seconds indoors or on a cold GPS start. The check-in list
// is already available instantly from local SQLite, so we don't let a slow/absent fix block
// the whole screen (local-first principle) — we race it against this timeout instead.
const LOCATION_FIX_TIMEOUT_MS = 3000;

export default function TodayRoute() {
  const router = useRouter();
  const repository = useFootLogRepository();
  const [checkIns, setCheckIns] = useState<CheckIn[]>([]);
  const [initialRegion, setInitialRegion] = useState<MapRegion>(resolveInitialMapRegion(null, []));
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const hasLoadedOnceRef = useRef(false);

  useFocusEffect(
    useCallback(() => {
      let isCurrent = true;
      let fixApplied = false;
      const { localDate, timezone } = localDateAndTimezone();
      if (!hasLoadedOnceRef.current) {
        setIsLoading(true);
      }
      setHasError(false);

      const locationGateway = new ExpoLocationGateway();
      const locationFix = locationGateway.requestForegroundPermission()
        .then((permission) => (permission === 'granted' ? locationGateway.getCurrentFix() : null))
        .catch(() => null);

      let timeoutId: ReturnType<typeof setTimeout>;
      const timeoutFix = new Promise<null>((resolve) => {
        timeoutId = setTimeout(() => resolve(null), LOCATION_FIX_TIMEOUT_MS);
      });
      const locationFixWithTimeout = Promise.race([locationFix, timeoutFix])
        .finally(() => clearTimeout(timeoutId));

      // The check-in list is ready instantly from local SQLite — render as soon as it
      // resolves rather than waiting on the (possibly slow) location fix.
      void repository.listByLocalDay(localDate, timezone)
        .then((records) => {
          if (!isCurrent) return;
          setCheckIns(records);
          if (!fixApplied) {
            setInitialRegion(resolveInitialMapRegion(null, records));
          }
          hasLoadedOnceRef.current = true;
        })
        .catch(() => {
          if (isCurrent) setHasError(true);
        })
        .finally(() => {
          if (isCurrent) setIsLoading(false);
        });

      // Background refinement: once the location fix settles (fast path) or times out
      // (slow/absent GPS), nudge the region toward the device's actual location if we got one.
      void locationFixWithTimeout.then((fix) => {
        if (!isCurrent || !fix) return;
        fixApplied = true;
        setInitialRegion(resolveInitialMapRegion(fix, []));
      });

      return () => { isCurrent = false; clearTimeout(timeoutId); };
    }, [repository]),
  );

  return (
    <SafeAreaView style={styles.container}>
      {isLoading ? (
        <View style={styles.centered}><Text style={styles.message}>오늘의 발자국을 불러오는 중이에요.</Text></View>
      ) : hasError ? (
        <View style={styles.centered}><Text style={styles.message}>오늘의 발자국을 불러오지 못했어요.</Text></View>
      ) : (
        <TodayMapSheet
          checkIns={checkIns}
          initialRegion={initialRegion}
          onStartCheckIn={() => router.push('/check-in')}
          onOpenReminderSettings={() => router.push('/settings/reminders')}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  message: { fontSize: 16, color: colors.textSecondary, textAlign: 'center' },
});
