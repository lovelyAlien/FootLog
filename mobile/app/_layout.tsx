import * as Notifications from 'expo-notifications';
import { Stack, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { FootLogRepositoryProvider } from '../src/database/FootLogContext';
import { openFootLogDatabase } from '../src/database/openDatabase';
import { SQLiteCheckInRepository } from '../src/features/check-in/SQLiteCheckInRepository';
import type { CheckInRepository } from '../src/features/check-in/domain';
import { ExpoNotificationScheduler } from '../src/features/notifications/ExpoNotificationScheduler';
import {
  NotificationSettingsProvider,
  type NotificationSettingsDependencies,
} from '../src/features/notifications/NotificationSettingsContext';
import { startNotificationResponseRouting } from '../src/features/notifications/notificationResponseRouting';
import { AppSettingsRepository } from '../src/features/settings/AppSettingsRepository';

type InitializationState =
  | { status: 'loading' }
  | {
      status: 'ready';
      repository: CheckInRepository;
      notificationSettings: NotificationSettingsDependencies;
    }
  | { status: 'error' };

export default function RootLayout() {
  const router = useRouter();
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<InitializationState>({ status: 'loading' });

  useEffect(() => {
    if (state.status !== 'ready') return;

    return startNotificationResponseRouting(
      Notifications,
      (url) => router.push(url),
    );
  }, [router, state.status]);

  useEffect(() => {
    let isCurrent = true;

    void openFootLogDatabase()
      .then((database) => {
        if (isCurrent) {
          const settingsRepository = new AppSettingsRepository(database);
          setState({
            status: 'ready',
            repository: new SQLiteCheckInRepository(database),
            notificationSettings: {
              repository: settingsRepository,
              scheduler: new ExpoNotificationScheduler(settingsRepository),
            },
          });
        }
      })
      .catch(() => {
        if (isCurrent) setState({ status: 'error' });
      });

    return () => { isCurrent = false; };
  }, [attempt]);

  if (state.status === 'loading') {
    return <LoadingState />;
  }

  if (state.status === 'error') {
    return (
      <View style={styles.centered}>
        <Text style={styles.title}>FootLog을 준비하지 못했어요.</Text>
        <Text style={styles.body}>로컬 저장소를 다시 열어 볼게요.</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="다시 시도"
          onPress={() => {
            setState({ status: 'loading' });
            setAttempt((value) => value + 1);
          }}
          style={styles.retryButton}
        >
          <Text style={styles.retryButtonText}>다시 시도</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <FootLogRepositoryProvider value={state.repository}>
      <NotificationSettingsProvider value={state.notificationSettings}>
        <Stack>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="check-in" options={{ title: '체크인' }} />
          <Stack.Screen name="settings/reminders" options={{ title: '체크인 알림' }} />
        </Stack>
      </NotificationSettingsProvider>
    </FootLogRepositoryProvider>
  );
}

function LoadingState() {
  return (
    <View style={styles.centered}>
      <Text style={styles.title}>FootLog 준비 중</Text>
      <Text style={styles.body}>안전하게 로컬 기록을 불러오고 있어요.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12, backgroundColor: '#ffffff' },
  title: { fontSize: 22, fontWeight: '700', color: '#1b1b1b', textAlign: 'center' },
  body: { fontSize: 16, color: '#515151', textAlign: 'center' },
  retryButton: { marginTop: 12, borderRadius: 12, backgroundColor: '#2e6af0', paddingHorizontal: 20, paddingVertical: 14 },
  retryButtonText: { color: '#ffffff', fontSize: 16, fontWeight: '700' },
});
