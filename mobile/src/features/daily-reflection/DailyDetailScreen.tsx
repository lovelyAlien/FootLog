import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MapView, { Marker, Polyline } from 'react-native-maps';

import type { CheckIn } from '../check-in/domain';
import { computeDailySummary } from './dailySummary';
import { useDailyDetail } from './useDailyDetail';

type DailyDetailScreenProps = {
  localDate: string;
};

function formatLocalTime(checkedInAt: string): string {
  return new Intl.DateTimeFormat('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(checkedInAt));
}

function formatDuration(startedAt: string, endedAt: string): string {
  const totalMinutes = Math.round((Date.parse(endedAt) - Date.parse(startedAt)) / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes}분`;
  return minutes === 0 ? `${hours}시간` : `${hours}시간 ${minutes}분`;
}

function buildTimelineHours(
  startHour: number,
  endHour: number,
  checkIns: CheckIn[],
): { hour: number; checkIn: CheckIn | null }[] {
  const checkInByHour = new Map<number, CheckIn>();
  for (const checkIn of checkIns) {
    const hour = new Date(checkIn.checkedInAt).getHours();
    if (!checkInByHour.has(hour)) checkInByHour.set(hour, checkIn);
  }

  return Array.from({ length: endHour - startHour + 1 }, (_, index) => {
    const hour = startHour + index;
    return { hour, checkIn: checkInByHour.get(hour) ?? null };
  });
}

export function DailyDetailScreen({ localDate }: DailyDetailScreenProps) {
  const { state, reload } = useDailyDetail(localDate);
  const [selectedCheckInId, setSelectedCheckInId] = useState<string | null>(null);

  if (state.status === 'loading') {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centered}><Text style={styles.message}>이날의 기록을 불러오는 중이에요.</Text></View>
      </SafeAreaView>
    );
  }

  if (state.status === 'error') {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centered}>
          <Text style={styles.message}>이날의 기록을 불러오지 못했어요.</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="다시 시도" onPress={reload} style={styles.retryButton}>
            <Text style={styles.retryButtonText}>다시 시도</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const { checkIns, activityWindow } = state;
  const summary = computeDailySummary(checkIns);
  const sortedCheckIns = [...checkIns].sort((a, b) => Date.parse(a.checkedInAt) - Date.parse(b.checkedInAt));
  const timelineHours = buildTimelineHours(activityWindow.startHour, activityWindow.endHour, checkIns);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{localDate}</Text>
        <Text style={styles.subtitle}>체크인 {summary.checkInCount}개</Text>
      </View>

      {checkIns.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>이날은 남겨진 발자국이 없어요.</Text>
        </View>
      ) : (
        <>
          <MapView
            style={styles.map}
            initialRegion={{
              latitude: sortedCheckIns[0].latitude,
              longitude: sortedCheckIns[0].longitude,
              latitudeDelta: 0.02,
              longitudeDelta: 0.02,
            }}
          >
            {sortedCheckIns.map((checkIn) => (
              <Marker
                key={checkIn.id}
                testID={`daily-detail-pin-${checkIn.id}`}
                coordinate={{ latitude: checkIn.latitude, longitude: checkIn.longitude }}
                pinColor={checkIn.id === selectedCheckInId ? '#2e6af0' : undefined}
                onPress={() => setSelectedCheckInId(checkIn.id)}
              />
            ))}
            <Polyline coordinates={sortedCheckIns.map((checkIn) => ({ latitude: checkIn.latitude, longitude: checkIn.longitude }))} />
          </MapView>
          <Text style={styles.mapCaption}>선은 실제 이동 경로가 아니라 기록 지점을 시간순으로 연결한 선이에요.</Text>

          <View style={styles.summary}>
            <Text style={styles.summaryText}>
              첫 체크인 {formatLocalTime(summary.firstCheckedInAt!)} · 마지막 체크인 {formatLocalTime(summary.lastCheckedInAt!)}
            </Text>
            <Text style={styles.summaryText}>이동 거리 약 {Math.round(summary.approximateDistanceMeters)}m</Text>
            {summary.longestConsecutiveArea && (
              <Text style={styles.summaryText}>
                가장 오래 머문 영역 {formatDuration(summary.longestConsecutiveArea.startedAt, summary.longestConsecutiveArea.endedAt)}
              </Text>
            )}
          </View>

          <View style={styles.timeline}>
            {timelineHours.map(({ hour, checkIn }) => (
              <Pressable
                key={hour}
                disabled={!checkIn}
                accessibilityRole={checkIn ? 'button' : undefined}
                accessibilityLabel={checkIn ? `${hour}시 체크인` : undefined}
                testID={checkIn ? `daily-detail-timeline-${checkIn.id}` : `daily-detail-timeline-empty-${hour}`}
                onPress={() => checkIn && setSelectedCheckInId(checkIn.id)}
                style={[
                  styles.timelineSlot,
                  checkIn && styles.timelineSlotFilled,
                  checkIn?.id === selectedCheckInId && styles.timelineSlotSelected,
                ]}
              >
                <Text style={styles.timelineHour}>{String(hour).padStart(2, '0')}:00</Text>
              </Pressable>
            ))}
          </View>
        </>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#ffffff' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  message: { fontSize: 16, color: '#515151', textAlign: 'center' },
  retryButton: { borderRadius: 12, backgroundColor: '#2e6af0', paddingHorizontal: 20, paddingVertical: 14 },
  retryButtonText: { color: '#ffffff', fontSize: 16, fontWeight: '700' },
  header: { padding: 16, gap: 4 },
  title: { fontSize: 22, fontWeight: '700', color: '#1b1b1b' },
  subtitle: { fontSize: 14, color: '#8a8a8a' },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  emptyText: { fontSize: 16, color: '#515151' },
  map: { height: 260, marginHorizontal: 16, borderRadius: 16 },
  mapCaption: { fontSize: 12, color: '#8a8a8a', marginHorizontal: 16, marginTop: 6 },
  summary: { padding: 16, gap: 6 },
  summaryText: { fontSize: 14, color: '#1b1b1b' },
  timeline: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 12, gap: 8 },
  timelineSlot: { width: 64, paddingVertical: 8, alignItems: 'center', borderRadius: 8, borderWidth: 1, borderColor: 'transparent' },
  timelineSlotFilled: { backgroundColor: '#eef2ff' },
  timelineSlotSelected: { borderColor: '#2e6af0' },
  timelineHour: { fontSize: 12, color: '#1b1b1b' },
});
