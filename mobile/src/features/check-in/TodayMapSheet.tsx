import { useCallback, useMemo, useRef, useState } from 'react';
import type { ElementRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import MapView from 'react-native-maps';
import BottomSheet, { BottomSheetFlatList, type BottomSheetFlatListMethods } from '@gorhom/bottom-sheet';

import { colors } from '../../shared/theme';
import { CheckInMapPins } from './CheckInMapPins';
import { CheckInListRow } from './CheckInListRow';
import type { MapRegion } from './resolveInitialMapRegion';
import type { CheckIn } from './domain';

type TodayMapSheetProps = {
  checkIns: CheckIn[];
  initialRegion: MapRegion;
  onStartCheckIn: () => void;
  onOpenReminderSettings?: () => void;
};

const SNAP_POINTS = ['14%', '50%', '92%'];
const PEEK_INDEX = 0;
const HALF_INDEX = 1;

export function TodayMapSheet({ checkIns, initialRegion, onStartCheckIn, onOpenReminderSettings }: TodayMapSheetProps) {
  const chronologicalCheckIns = useMemo(
    () => [...checkIns].sort((left, right) => Date.parse(left.checkedInAt) - Date.parse(right.checkedInAt)),
    [checkIns],
  );
  const [selectedCheckInId, setSelectedCheckInId] = useState<string | null>(null);
  const sheetRef = useRef<ElementRef<typeof BottomSheet>>(null);
  const listRef = useRef<BottomSheetFlatListMethods>(null);

  const selectFromPin = useCallback((id: string) => {
    setSelectedCheckInId(id);
    sheetRef.current?.snapToIndex(HALF_INDEX);
    const index = chronologicalCheckIns.findIndex((checkIn) => checkIn.id === id);
    if (index >= 0) {
      listRef.current?.scrollToIndex({ index, animated: true });
    }
  }, [chronologicalCheckIns]);

  return (
    <View style={styles.container}>
      <MapView style={styles.map} initialRegion={initialRegion}>
        <CheckInMapPins
          checkIns={chronologicalCheckIns}
          selectedCheckInId={selectedCheckInId}
          onSelectCheckIn={selectFromPin}
          testIDPrefix="today-map"
        />
      </MapView>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="지금 체크인"
        onPress={onStartCheckIn}
        style={styles.fab}
      >
        <Text style={styles.fabText}>＋</Text>
      </Pressable>

      <BottomSheet ref={sheetRef} index={PEEK_INDEX} snapPoints={SNAP_POINTS}>
        <View style={styles.sheetHeader}>
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

        {chronologicalCheckIns.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>오늘의 발자국이 아직 없어요.</Text>
            <Text style={styles.emptyBody}>지금 있는 곳을 첫 발자국으로 남겨 보세요.</Text>
          </View>
        ) : (
          <BottomSheetFlatList
            ref={listRef}
            data={chronologicalCheckIns}
            keyExtractor={(checkIn: CheckIn) => checkIn.id}
            contentContainerStyle={styles.list}
            renderItem={({ item }: { item: CheckIn }) => (
              <CheckInListRow
                checkIn={item}
                isSelected={item.id === selectedCheckInId}
                onPress={setSelectedCheckInId}
              />
            )}
          />
        )}
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { ...StyleSheet.absoluteFill },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 160,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  fabText: { color: colors.onPrimary, fontSize: 28, fontWeight: '700', lineHeight: 30 },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  title: { fontSize: 20, fontWeight: '700', color: colors.textPrimary },
  settingsButton: {
    borderRadius: 10,
    backgroundColor: colors.primarySoftBackground,
    paddingHorizontal: 12,
    minHeight: 44,
    justifyContent: 'center',
  },
  settingsButtonText: { color: colors.primarySoftText, fontSize: 14, fontWeight: '700' },
  emptyState: { paddingHorizontal: 20, paddingBottom: 24, gap: 8 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: colors.textPrimary },
  emptyBody: { fontSize: 15, lineHeight: 22, color: colors.textSecondary },
  list: { paddingHorizontal: 20, paddingBottom: 24, gap: 12 },
});
