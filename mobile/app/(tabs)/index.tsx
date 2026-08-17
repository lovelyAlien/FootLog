import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useFootLogRepository } from '../../src/database/FootLogContext';
import { localDateAndTimezone } from '../../src/shared/localDate';
import { TodayCheckIns } from '../../src/features/check-in/TodayCheckIns';
import type { CheckIn } from '../../src/features/check-in/domain';

export default function TodayRoute() {
  const router = useRouter();
  const repository = useFootLogRepository();
  const [checkIns, setCheckIns] = useState<CheckIn[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let isCurrent = true;
      const { localDate, timezone } = localDateAndTimezone();
      setIsLoading(true);
      setHasError(false);

      void repository.listByLocalDay(localDate, timezone)
        .then((records) => {
          if (isCurrent) setCheckIns(records);
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
        <TodayCheckIns
          checkIns={checkIns}
          onStartCheckIn={() => router.push('/check-in')}
          onOpenReminderSettings={() => router.push('/settings/reminders')}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#ffffff' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  message: { fontSize: 16, color: '#515151', textAlign: 'center' },
});
