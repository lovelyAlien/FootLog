import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors } from '../../shared/theme';
import type {
  NotificationSettings,
  NotificationSettingsRepository,
} from '../settings/AppSettingsRepository';
import type { NotificationScheduler } from './ExpoNotificationScheduler';

type NotificationSettingsScreenProps = {
  repository: NotificationSettingsRepository;
  scheduler: NotificationScheduler;
};

const HOURS = Array.from({ length: 24 }, (_, hour) => hour);

function formatHour(hour: number): string {
  return `${hour.toString().padStart(2, '0')}:00`;
}

export function NotificationSettingsScreen({
  repository,
  scheduler,
}: NotificationSettingsScreenProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [isBusy, setIsBusy] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [startHour, setStartHour] = useState(7);
  const [endHour, setEndHour] = useState(23);
  const [savedWindow, setSavedWindow] = useState({ startHour: 7, endHour: 23 });
  const [message, setMessage] = useState<string | null>(null);
  const busyRef = useRef(false);

  const applySettings = useCallback((settings: NotificationSettings) => {
    const authoritativeWindow = {
      startHour: settings.startHour,
      endHour: settings.endHour,
    };
    setEnabled(settings.enabled);
    setStartHour(settings.startHour);
    setEndHour(settings.endHour);
    setSavedWindow(authoritativeWindow);
  }, []);

  useEffect(() => {
    let isCurrent = true;
    void repository.getNotificationSettings()
      .then((settings) => {
        if (!isCurrent) return;
        applySettings(settings);
      })
      .catch(() => {
        if (isCurrent) setMessage('알림 설정을 불러오지 못했어요.');
      })
      .finally(() => {
        if (isCurrent) setIsLoading(false);
      });

    return () => { isCurrent = false; };
  }, [applySettings, repository]);

  const syncAfterFailure = async (errorMessage: string) => {
    try {
      applySettings(await repository.getNotificationSettings());
    } catch {
      // Scheduling failed and cleanup is conservative, so do not leave the UI claiming it is on.
      setEnabled(false);
    }
    setMessage(errorMessage);
  };

  const isValidWindow = startHour < endHour;
  const window = { startHour, endHour };

  const setReminderEnabled = async (nextEnabled: boolean) => {
    if (busyRef.current || (nextEnabled && !isValidWindow)) return;
    busyRef.current = true;
    setIsBusy(true);
    setMessage(null);

    try {
      if (nextEnabled) {
        const result = await scheduler.reschedule(window);
        if (result.status === 'denied') {
          setEnabled(false);
          setSavedWindow(window);
          setMessage('알림 권한이 꺼져 있어요. 기기 설정에서 허용한 뒤 다시 시도해 주세요.');
        } else {
          setEnabled(true);
          setSavedWindow(window);
        }
      } else {
        await scheduler.disable(savedWindow);
        setEnabled(false);
      }
    } catch {
      await syncAfterFailure('알림 설정을 바꾸지 못했어요. 잠시 후 다시 시도해 주세요.');
    } finally {
      busyRef.current = false;
      setIsBusy(false);
    }
  };

  const saveWindow = async () => {
    if (busyRef.current || !isValidWindow) return;
    busyRef.current = true;
    setIsBusy(true);
    setMessage(null);

    try {
      if (enabled) {
        const result = await scheduler.reschedule(window);
        if (result.status === 'denied') {
          setEnabled(false);
          setSavedWindow(window);
          setMessage('알림 권한이 꺼져 있어요. 기기 설정에서 허용한 뒤 다시 시도해 주세요.');
        } else {
          setSavedWindow(window);
        }
      } else {
        const current = await repository.getNotificationSettings();
        await repository.setNotificationSettings({
          enabled: false,
          ...window,
          scheduledIds: current.scheduledIds,
        });
        setSavedWindow(window);
      }
    } catch {
      await syncAfterFailure('알림 시간을 저장하지 못했어요. 잠시 후 다시 시도해 주세요.');
    } finally {
      busyRef.current = false;
      setIsBusy(false);
    }
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.centered}>
        <Text style={styles.body}>알림 설정을 불러오는 중이에요.</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.heading}>
          <Text style={styles.title}>체크인 알림</Text>
          <Text style={styles.body}>활동 시간 동안 매시 정각에 발자국을 남기도록 알려 드려요.</Text>
        </View>

        <View style={styles.settingRow}>
          <View style={styles.settingCopy}>
            <Text style={styles.settingTitle}>시간별 체크인 알림</Text>
            <Text style={styles.body}>{formatHour(startHour)}–{formatHour(endHour)}</Text>
          </View>
          <Switch
            accessibilityLabel="시간별 체크인 알림"
            disabled={isBusy || (!enabled && !isValidWindow)}
            onValueChange={(value) => { void setReminderEnabled(value); }}
            value={enabled}
          />
        </View>

        <HourSelector
          label="시작 시간"
          selectedHour={startHour}
          disabled={isBusy}
          onSelect={setStartHour}
        />
        <HourSelector
          label="종료 시간"
          selectedHour={endHour}
          disabled={isBusy}
          onSelect={setEndHour}
        />

        {!isValidWindow && (
          <Text accessibilityRole="alert" style={styles.error}>
            종료 시간은 시작 시간보다 늦어야 해요
          </Text>
        )}
        {message && <Text accessibilityRole="alert" style={styles.message}>{message}</Text>}

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="알림 시간 저장"
          accessibilityState={{ disabled: isBusy || !isValidWindow }}
          disabled={isBusy || !isValidWindow}
          onPress={() => { void saveWindow(); }}
          style={[styles.saveButton, (isBusy || !isValidWindow) && styles.disabledButton]}
        >
          <Text style={styles.saveButtonText}>알림 시간 저장</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

type HourSelectorProps = {
  label: string;
  selectedHour: number;
  disabled: boolean;
  onSelect: (hour: number) => void;
};

function HourSelector({ label, selectedHour, disabled, onSelect }: HourSelectorProps) {
  return (
    <View style={styles.selector}>
      <Text style={styles.settingTitle}>{label}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={styles.hourOptions}>
          {HOURS.map((hour) => {
            const selected = hour === selectedHour;
            return (
              <Pressable
                key={hour}
                accessibilityRole="button"
                accessibilityLabel={`${label} ${formatHour(hour)}`}
                accessibilityState={{ selected, disabled }}
                disabled={disabled}
                onPress={() => onSelect(hour)}
                style={[styles.hourOption, selected && styles.selectedHourOption]}
              >
                <Text style={[styles.hourOptionText, selected && styles.selectedHourOptionText]}>
                  {formatHour(hour)}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: colors.background },
  container: { padding: 24, gap: 24 },
  heading: { gap: 8 },
  title: { fontSize: 30, fontWeight: '700', color: colors.textPrimary },
  body: { fontSize: 16, lineHeight: 24, color: colors.textSecondary },
  settingRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  settingCopy: { flex: 1, gap: 4 },
  settingTitle: { fontSize: 17, fontWeight: '700', color: colors.textPrimary },
  selector: { gap: 12 },
  hourOptions: { flexDirection: 'row', gap: 8 },
  hourOption: { borderWidth: 1, borderColor: colors.optionBorder, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10 },
  selectedHourOption: { backgroundColor: colors.primary, borderColor: colors.primary },
  hourOptionText: { color: colors.optionText, fontSize: 15, fontWeight: '600' },
  selectedHourOptionText: { color: colors.onPrimary },
  error: { color: colors.error, fontSize: 15, lineHeight: 22 },
  message: { color: colors.noticeText, backgroundColor: colors.noticeBackground, borderRadius: 10, padding: 14, fontSize: 15, lineHeight: 22 },
  saveButton: { alignItems: 'center', borderRadius: 12, backgroundColor: colors.primary, paddingVertical: 16 },
  disabledButton: { opacity: 0.4 },
  saveButtonText: { color: colors.onPrimary, fontSize: 16, fontWeight: '700' },
});
