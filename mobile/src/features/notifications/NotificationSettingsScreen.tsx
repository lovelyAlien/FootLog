import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors } from '../../shared/theme';
import type {
  NotificationSettings,
  NotificationSettingsRepository,
} from '../settings/AppSettingsRepository';
import { ACTIVITY_WINDOW_PRESETS, matchPreset } from './activityWindowPresets';
import { ActivityWindowSlider } from './ActivityWindowSlider';
import { countScheduledNotificationsPerDay, type ActivityWindow } from './notificationSchedule';
import type { NotificationScheduler } from './ExpoNotificationScheduler';

type NotificationSettingsScreenProps = {
  repository: NotificationSettingsRepository;
  scheduler: NotificationScheduler;
};

const INTERVAL_OPTIONS = [1, 2, 3];

export function NotificationSettingsScreen({
  repository,
  scheduler,
}: NotificationSettingsScreenProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [isBusy, setIsBusy] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [startHour, setStartHour] = useState(7);
  const [endHour, setEndHour] = useState(23);
  const [intervalHours, setIntervalHours] = useState(1);
  const [message, setMessage] = useState<string | null>(null);
  const busyRef = useRef(false);

  const applySettings = useCallback((settings: NotificationSettings) => {
    setEnabled(settings.enabled);
    setStartHour(settings.startHour);
    setEndHour(settings.endHour);
    setIntervalHours(settings.intervalHours);
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

  const applyChange = async (nextWindow: ActivityWindow, nextIntervalHours: number) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setIsBusy(true);
    setMessage(null);
    setStartHour(nextWindow.startHour);
    setEndHour(nextWindow.endHour);
    setIntervalHours(nextIntervalHours);

    try {
      if (enabled) {
        const result = await scheduler.reschedule(nextWindow, nextIntervalHours);
        if (result.status === 'denied') {
          setEnabled(false);
          setMessage('알림 권한이 꺼져 있어요. 기기 설정에서 허용한 뒤 다시 시도해 주세요.');
        }
      } else {
        const current = await repository.getNotificationSettings();
        await repository.setNotificationSettings({
          enabled: false,
          ...nextWindow,
          intervalHours: nextIntervalHours,
          scheduledIds: current.scheduledIds,
        });
      }
    } catch {
      await syncAfterFailure('알림 설정을 바꾸지 못했어요. 잠시 후 다시 시도해 주세요.');
    } finally {
      busyRef.current = false;
      setIsBusy(false);
    }
  };

  const setReminderEnabled = async (nextEnabled: boolean) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setIsBusy(true);
    setMessage(null);

    try {
      if (nextEnabled) {
        const result = await scheduler.reschedule({ startHour, endHour }, intervalHours);
        if (result.status === 'denied') {
          setEnabled(false);
          setMessage('알림 권한이 꺼져 있어요. 기기 설정에서 허용한 뒤 다시 시도해 주세요.');
        } else {
          setEnabled(true);
        }
      } else {
        await scheduler.disable({ startHour, endHour });
        setEnabled(false);
      }
    } catch {
      await syncAfterFailure('알림 설정을 바꾸지 못했어요. 잠시 후 다시 시도해 주세요.');
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

  const selectedPresetId = matchPreset(startHour, endHour);
  const dailyCount = countScheduledNotificationsPerDay({ startHour, endHour }, intervalHours);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.heading}>
          <Text style={styles.title}>체크인 알림</Text>
          <Text style={styles.body}>활동 시간 동안 설정한 간격으로 발자국을 남기도록 알려 드려요.</Text>
        </View>

        <View style={styles.settingRow}>
          <View style={styles.settingCopy}>
            <Text style={styles.settingTitle}>시간별 체크인 알림</Text>
          </View>
          <Switch
            accessibilityLabel="시간별 체크인 알림"
            disabled={isBusy}
            onValueChange={(value) => { void setReminderEnabled(value); }}
            value={enabled}
          />
        </View>

        <View style={styles.presetRow}>
          {ACTIVITY_WINDOW_PRESETS.map((preset) => {
            const selected = selectedPresetId === preset.id;
            return (
              <Pressable
                key={preset.id}
                accessibilityRole="button"
                accessibilityLabel={preset.label}
                accessibilityState={{ selected, disabled: isBusy }}
                disabled={isBusy}
                onPress={() => { void applyChange({ startHour: preset.startHour, endHour: preset.endHour }, intervalHours); }}
                style={[styles.presetChip, selected && styles.selectedPresetChip]}
              >
                <Text style={[styles.presetChipText, selected && styles.selectedPresetChipText]}>{preset.label}</Text>
              </Pressable>
            );
          })}
        </View>

        {selectedPresetId === null && (
          <Text style={styles.customWindowLabel}>직접 설정</Text>
        )}

        <ActivityWindowSlider
          startHour={startHour}
          endHour={endHour}
          disabled={isBusy}
          onChangeEnd={(nextWindow) => { void applyChange(nextWindow, intervalHours); }}
        />

        <View style={styles.intervalSection}>
          <Text style={styles.settingTitle}>알림 간격</Text>
          <View style={styles.intervalRow}>
            {INTERVAL_OPTIONS.map((hours) => {
              const selected = hours === intervalHours;
              return (
                <Pressable
                  key={hours}
                  accessibilityRole="button"
                  accessibilityLabel={`${hours}시간 간격`}
                  accessibilityState={{ selected, disabled: isBusy }}
                  disabled={isBusy}
                  onPress={() => { void applyChange({ startHour, endHour }, hours); }}
                  style={[styles.intervalOption, selected && styles.selectedIntervalOption]}
                >
                  <Text style={[styles.intervalOptionText, selected && styles.selectedIntervalOptionText]}>{hours}시간</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <Text style={styles.summary}>하루 {dailyCount}회 알림</Text>

        {message && <Text accessibilityRole="alert" style={styles.message}>{message}</Text>}
      </ScrollView>
    </SafeAreaView>
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
  presetRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  presetChip: { borderWidth: 1, borderColor: colors.optionBorder, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8 },
  selectedPresetChip: { backgroundColor: colors.primary, borderColor: colors.primary },
  presetChipText: { color: colors.optionText, fontSize: 14, fontWeight: '600' },
  selectedPresetChipText: { color: colors.onPrimary },
  customWindowLabel: { fontSize: 13, color: colors.textMuted },
  intervalSection: { gap: 10 },
  intervalRow: { flexDirection: 'row', gap: 8 },
  intervalOption: { flex: 1, alignItems: 'center', borderWidth: 1, borderColor: colors.optionBorder, borderRadius: 10, paddingVertical: 10 },
  selectedIntervalOption: { backgroundColor: colors.primary, borderColor: colors.primary },
  intervalOptionText: { color: colors.optionText, fontSize: 15, fontWeight: '600' },
  selectedIntervalOptionText: { color: colors.onPrimary },
  summary: { fontSize: 14, color: colors.textMuted, textAlign: 'center' },
  message: { color: colors.noticeText, backgroundColor: colors.noticeBackground, borderRadius: 10, padding: 14, fontSize: 15, lineHeight: 22 },
});
