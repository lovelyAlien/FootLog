import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useFootLogRepository } from '../../src/database/FootLogContext';
import { localDateAndTimezone } from '../../src/shared/localDate';
import { colors } from '../../src/shared/theme';
import { TodayMapSheet } from '../../src/features/check-in/TodayMapSheet';
import { ExpoLocationGateway } from '../../src/features/check-in/ExpoLocationGateway';
import { resolveInitialMapRegion, type MapRegion } from '../../src/features/check-in/resolveInitialMapRegion';
import type { CheckIn } from '../../src/features/check-in/domain';

export default function TodayRoute() {
  const router = useRouter();
  const repository = useFootLogRepository();
  const [checkIns, setCheckIns] = useState<CheckIn[]>([]);
  const [initialRegion, setInitialRegion] = useState<MapRegion>(resolveInitialMapRegion(null, []));
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let isCurrent = true;
      const { localDate, timezone } = localDateAndTimezone();
      setIsLoading(true);
      setHasError(false);

      const locationGateway = new ExpoLocationGateway();
      const locationFix = locationGateway.requestForegroundPermission()
        .then((permission) => (permission === 'granted' ? locationGateway.getCurrentFix() : null))
        .catch(() => null);

      void Promise.all([repository.listByLocalDay(localDate, timezone), locationFix])
        .then(([records, fix]) => {
          if (!isCurrent) return;
          setCheckIns(records);
          setInitialRegion(resolveInitialMapRegion(fix, records));
        })
        .catch(() => {
          if (isCurrent) setHasError(true);
        })
        .finally(() => {
          if (isCurrent) setIsLoading(false);
        });

      return () => { isCurrent = false; };
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
