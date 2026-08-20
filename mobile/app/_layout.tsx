import { Fraunces_500Medium, useFonts } from '@expo-google-fonts/fraunces';
import * as Crypto from 'expo-crypto';
import * as Notifications from 'expo-notifications';
import { Stack, useRootNavigationState, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { AppState, Pressable, StyleSheet, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { FootLogRepositoryProvider } from '../src/database/FootLogContext';
import { openFootLogDatabase } from '../src/database/openDatabase';
import { SQLiteCheckInRepository } from '../src/features/check-in/SQLiteCheckInRepository';
import type { CheckInRepository } from '../src/features/check-in/domain';
import {
  DailyReflectionProvider,
  type DailyReflectionDependencies,
} from '../src/features/daily-reflection/DailyReflectionContext';
import { SQLiteDailyReflectionDraftRepository } from '../src/features/daily-reflection/SQLiteDailyReflectionDraftRepository';
import { SQLiteDailyReflectionRepository } from '../src/features/daily-reflection/SQLiteDailyReflectionRepository';
import { ExpoNotificationScheduler } from '../src/features/notifications/ExpoNotificationScheduler';
import {
  NotificationSettingsProvider,
  type NotificationSettingsDependencies,
} from '../src/features/notifications/NotificationSettingsContext';
import {
  configureForegroundNotificationPresentation,
  startNotificationResponseRouting,
} from '../src/features/notifications/notificationResponseRouting';
import { AppSettingsRepository } from '../src/features/settings/AppSettingsRepository';
import { colors } from '../src/shared/theme';

configureForegroundNotificationPresentation(Notifications);

type InitializationState =
  | { status: 'loading' }
  | {
      status: 'ready';
      repository: CheckInRepository;
      notificationSettings: NotificationSettingsDependencies;
      dailyReflection: DailyReflectionDependencies;
    }
  | { status: 'error' };

export default function RootLayout() {
  const router = useRouter();
  const rootNavigationState = useRootNavigationState();
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<InitializationState>({ status: 'loading' });
  const [fontsLoaded] = useFonts({ Fraunces_500Medium });
  const [pendingNotificationRoute, setPendingNotificationRoute] = useState<{
    url: '/check-in';
  } | null>(null);
  const handledNotificationRoute = useRef<typeof pendingNotificationRoute>(null);

  useEffect(() => {
    return startNotificationResponseRouting(
      Notifications,
      (url) => setPendingNotificationRoute({ url }),
    );
  }, []);

  useEffect(() => {
    if (
      state.status !== 'ready'
      || !rootNavigationState?.key
      || !pendingNotificationRoute
      || pendingNotificationRoute === handledNotificationRoute.current
    ) return;

    handledNotificationRoute.current = pendingNotificationRoute;
    router.push(pendingNotificationRoute.url);
  }, [pendingNotificationRoute, rootNavigationState?.key, router, state.status]);

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
            dailyReflection: {
              reflectionRepository: new SQLiteDailyReflectionRepository(database),
              draftRepository: new SQLiteDailyReflectionDraftRepository(database),
              uuid: Crypto.randomUUID,
              now: () => new Date().toISOString(),
            },
          });
        }
      })
      .catch(() => {
        if (isCurrent) setState({ status: 'error' });
      });

    return () => { isCurrent = false; };
  }, [attempt]);

  useEffect(() => {
    if (state.status !== 'ready') return;

    const refresh = () => {
      void state.notificationSettings.scheduler.refreshIfEnabled().catch(() => {
        // A later foreground transition can retry without blocking app use.
      });
    };
    refresh();
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') refresh();
    });
    return () => subscription.remove();
  }, [state]);

  let content: React.ReactNode;

  if (state.status === 'loading' || !fontsLoaded) {
    content = <LoadingState />;
  } else if (state.status === 'error') {
    content = (
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
  } else {
    content = (
      <FootLogRepositoryProvider value={state.repository}>
        <NotificationSettingsProvider value={state.notificationSettings}>
          <DailyReflectionProvider value={state.dailyReflection}>
            <Stack>
              <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
              <Stack.Screen
                name="check-in"
                options={{
                  title: '',
                  // Without an explicit back title, iOS falls back to the previous route's
                  // raw name ("(tabs)") as the back button label. 'minimal' shows just the
                  // chevron, matching standard iOS 14+ back button style.
                  headerBackButtonDisplayMode: 'minimal',
                }}
              />
              <Stack.Screen name="day/[date]" options={{ title: '일일 회고' }} />
              <Stack.Screen
                name="settings/reminders"
                options={{
                  title: '체크인 알림',
                  // The activity-window slider's left handle sits close to the screen edge for
                  // early start hours (e.g. the 07:00 "출근형" preset), where iOS's edge
                  // swipe-to-go-back gesture intercepts the drag before the slider's own
                  // PanResponder sees it. The header already provides an explicit back button,
                  // so disabling the swipe here loses no way to navigate back.
                  gestureEnabled: false,
                }}
              />
            </Stack>
          </DailyReflectionProvider>
        </NotificationSettingsProvider>
      </FootLogRepositoryProvider>
    );
  }

  return (
    <GestureHandlerRootView style={styles.root}>
      {content}
    </GestureHandlerRootView>
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
  root: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12, backgroundColor: colors.background },
  title: { fontSize: 22, fontWeight: '700', color: colors.textPrimary, textAlign: 'center' },
  body: { fontSize: 16, color: colors.textSecondary, textAlign: 'center' },
  retryButton: { marginTop: 12, borderRadius: 12, backgroundColor: colors.primary, paddingHorizontal: 20, paddingVertical: 14 },
  retryButtonText: { color: colors.onPrimary, fontSize: 16, fontWeight: '700' },
});
