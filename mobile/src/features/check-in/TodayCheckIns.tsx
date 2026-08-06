import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { CheckIn } from './domain';

type TodayCheckInsProps = {
  checkIns: CheckIn[];
  onStartCheckIn: () => void;
  onOpenReminderSettings?: () => void;
};

function formatLocalTime(checkedInAt: string): string {
  return new Intl.DateTimeFormat('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(checkedInAt));
}

export function TodayCheckIns({ checkIns, onStartCheckIn, onOpenReminderSettings }: TodayCheckInsProps) {
  const chronologicalCheckIns = [...checkIns].sort(
    (left, right) => Date.parse(left.checkedInAt) - Date.parse(right.checkedInAt),
  );

  return (
    <View style={styles.container}>
      <View style={styles.heading}>
        <View style={styles.headingRow}>
          <Text style={styles.title}>오늘</Text>
          {onOpenReminderSettings && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="알림 설정"
              onPress={onOpenReminderSettings}
              style={styles.settingsButton}
            >
              <Text style={styles.settingsButtonText}>알림 설정</Text>
            </Pressable>
          )}
        </View>
        <Text style={styles.subtitle}>오늘 남긴 발자국</Text>
      </View>

      {chronologicalCheckIns.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>오늘의 발자국이 아직 없어요.</Text>
          <Text style={styles.emptyBody}>지금 있는 곳을 첫 발자국으로 남겨 보세요.</Text>
        </View>
      ) : (
        <View style={styles.list}>
          {chronologicalCheckIns.map((checkIn) => (
            <View key={checkIn.id} style={styles.checkIn}>
              <Text testID="check-in-time" style={styles.time}>{formatLocalTime(checkIn.checkedInAt)}</Text>
              <Text style={styles.accuracy}>정확도 약 {Math.round(checkIn.accuracyM)}m</Text>
            </View>
          ))}
        </View>
      )}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="지금 체크인"
        onPress={onStartCheckIn}
        style={styles.primaryButton}
      >
        <Text style={styles.primaryButtonText}>지금 체크인</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, gap: 24, backgroundColor: '#ffffff' },
  heading: { gap: 6 },
  headingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 32, fontWeight: '700', color: '#1b1b1b' },
  subtitle: { fontSize: 16, color: '#515151' },
  settingsButton: { borderRadius: 10, backgroundColor: '#eef2ff', paddingHorizontal: 12, paddingVertical: 9 },
  settingsButtonText: { color: '#2948a8', fontSize: 14, fontWeight: '700' },
  emptyState: { flex: 1, justifyContent: 'center', gap: 8 },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: '#1b1b1b' },
  emptyBody: { fontSize: 16, lineHeight: 24, color: '#515151' },
  list: { flex: 1, gap: 12 },
  checkIn: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    padding: 18,
    gap: 6,
  },
  time: { fontSize: 20, fontWeight: '700', color: '#1b1b1b' },
  accuracy: { fontSize: 15, color: '#515151' },
  primaryButton: { alignItems: 'center', borderRadius: 12, backgroundColor: '#2e6af0', paddingVertical: 16 },
  primaryButtonText: { color: '#ffffff', fontSize: 16, fontWeight: '700' },
});
