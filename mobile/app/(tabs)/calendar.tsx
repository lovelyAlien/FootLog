import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useFootLogRepository } from '../../src/database/FootLogContext';
import { localDateAndTimezone } from '../../src/shared/localDate';
import { formatLocalTime } from '../../src/shared/formatLocalTime';
import { colors, fonts } from '../../src/shared/theme';
import type { CheckIn } from '../../src/features/check-in/domain';

const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

function firstWeekday(year: number, month: number): number {
  return new Date(year, month - 1, 1).getDay();
}

function toLocalDateString(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function formatPreviewDate(localDate: string): string {
  const [, month, day] = localDate.split('-').map(Number);
  return `${month}월 ${day}일`;
}

type PreviewState =
  | { status: 'loading' }
  | { status: 'loaded'; checkIns: CheckIn[] }
  | { status: 'error' };

export default function CalendarRoute() {
  const router = useRouter();
  const repository = useFootLogRepository();
  const { localDate: todayLocalDate, timezone } = localDateAndTimezone();
  const [todayYear, todayMonth] = todayLocalDate.split('-').map(Number);
  const [year, setYear] = useState(todayYear);
  const [month, setMonth] = useState(todayMonth);
  const [datesWithCheckIns, setDatesWithCheckIns] = useState<Set<string>>(new Set());
  const initialSelection = year === todayYear && month === todayMonth ? todayLocalDate : null;
  const [selectedDate, setSelectedDate] = useState<string | null>(initialSelection);
  // Tracks whether the current selection came from the silent default-today logic above,
  // as opposed to an explicit cell tap. A failed fetch for a default selection should fall
  // back to "no selection" (design doc §6) rather than show an error the user never asked
  // for; a failed fetch for a selection the user tapped should show the inline error.
  const [isDefaultSelection, setIsDefaultSelection] = useState(initialSelection !== null);
  const [preview, setPreview] = useState<PreviewState>({ status: 'loading' });

  const loadDots = useCallback(() => {
    void repository.listLocalDatesWithCheckIns(year, month, timezone)
      .then((dates) => setDatesWithCheckIns(new Set(dates)))
      .catch(() => setDatesWithCheckIns(new Set()));
  }, [repository, year, month, timezone]);

  useEffect(() => { loadDots(); }, [loadDots]);

  useEffect(() => {
    if (!selectedDate) return undefined;
    let isCurrent = true;
    setPreview({ status: 'loading' });
    void repository.listByLocalDay(selectedDate, timezone)
      .then((checkIns) => { if (isCurrent) setPreview({ status: 'loaded', checkIns }); })
      .catch(() => {
        if (!isCurrent) return;
        if (isDefaultSelection) {
          setSelectedDate(null);
        } else {
          setPreview({ status: 'error' });
        }
      });
    return () => { isCurrent = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- isDefaultSelection is read, not a trigger: re-running this effect when it flips would refetch a date whose fetch is already in flight.
  }, [selectedDate, repository, timezone]);

  const selectDate = (date: string) => {
    setIsDefaultSelection(false);
    setSelectedDate(date);
  };

  const goToPreviousMonth = () => {
    setSelectedDate(null);
    if (month === 1) { setYear((value) => value - 1); setMonth(12); } else { setMonth((value) => value - 1); }
  };

  const goToNextMonth = () => {
    setSelectedDate(null);
    if (month === 12) { setYear((value) => value + 1); setMonth(1); } else { setMonth((value) => value + 1); }
  };

  const totalDays = daysInMonth(year, month);
  const leadingBlanks = firstWeekday(year, month);
  const cells: (number | null)[] = [
    ...Array.from({ length: leadingBlanks }, () => null),
    ...Array.from({ length: totalDays }, (_, index) => index + 1),
  ];

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="이전 달" onPress={goToPreviousMonth}>
          <Text style={styles.navText}>‹</Text>
        </Pressable>
        <Text style={styles.title}>{year}년 {month}월</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="다음 달" onPress={goToNextMonth}>
          <Text style={styles.navText}>›</Text>
        </Pressable>
      </View>

      <View style={styles.weekdayRow}>
        {WEEKDAY_LABELS.map((label) => (
          <Text key={label} style={styles.weekdayLabel}>{label}</Text>
        ))}
      </View>

      <View style={styles.grid}>
        {cells.map((day, index) => {
          if (day === null) {
            return <View key={`blank-${index}`} style={styles.cell} />;
          }
          const localDate = toLocalDateString(year, month, day);
          const hasCheckIns = datesWithCheckIns.has(localDate);
          const isSelected = localDate === selectedDate;
          return (
            <Pressable
              key={localDate}
              accessibilityRole="button"
              accessibilityLabel={`${year}년 ${month}월 ${day}일`}
              accessibilityState={{ selected: isSelected }}
              onPress={() => selectDate(localDate)}
              style={[styles.cell, isSelected && styles.cellSelected]}
            >
              <Text style={[styles.dayText, isSelected && styles.dayTextSelected]}>{day}</Text>
              {hasCheckIns && (
                <View
                  testID={`calendar-dot-${localDate}`}
                  style={[styles.dot, isSelected && styles.dotSelected]}
                />
              )}
            </Pressable>
          );
        })}
      </View>

      <View style={styles.summary}>
        <View style={styles.legendRow}>
          <View style={styles.dot} />
          <Text style={styles.legendText}>체크인 기록이 있는 날</Text>
        </View>
        <Text style={styles.summaryText}>이번 달 체크인 {datesWithCheckIns.size}일</Text>
      </View>

      {selectedDate && (
        <View style={styles.preview}>
          <Text style={styles.previewDate}>{formatPreviewDate(selectedDate)}</Text>
          {preview.status === 'loading' && <ActivityIndicator color={colors.primary} />}
          {preview.status === 'error' && <Text style={styles.previewError}>불러오지 못했어요.</Text>}
          {preview.status === 'loaded' && (
            <Text style={styles.previewSummary}>
              {preview.checkIns.length === 0
                ? '이날은 남겨진 발자국이 없어요.'
                : `체크인 ${preview.checkIns.length}개 · ${[...preview.checkIns]
                    .sort((a, b) => Date.parse(a.checkedInAt) - Date.parse(b.checkedInAt))
                    .map((checkIn) => formatLocalTime(checkIn.checkedInAt))
                    .join(', ')}`}
            </Text>
          )}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="자세히 보기"
            onPress={() => router.push({ pathname: '/day/[date]', params: { date: selectedDate } })}
            style={styles.previewLink}
          >
            <Text style={styles.previewLinkText}>자세히 보기 →</Text>
          </Pressable>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: 16, gap: 16 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  navText: { fontSize: 24, color: colors.primary, paddingHorizontal: 12 },
  title: { fontSize: 26, fontFamily: fonts.display, color: colors.textPrimary },
  weekdayRow: { flexDirection: 'row' },
  weekdayLabel: { flex: 1, textAlign: 'center', fontSize: 13, color: colors.textMuted },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: `${100 / 7}%`, aspectRatio: 1, alignItems: 'center', justifyContent: 'center', gap: 4, borderRadius: 12 },
  cellSelected: { backgroundColor: colors.primary },
  dayText: { fontSize: 15, color: colors.textPrimary },
  dayTextSelected: { color: colors.onPrimary, fontWeight: '700' },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.primary },
  dotSelected: { backgroundColor: colors.onPrimary },
  summary: { paddingTop: 8, gap: 8, borderTopWidth: 1, borderTopColor: colors.border },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendText: { fontSize: 13, color: colors.textMuted },
  summaryText: { fontSize: 14, fontWeight: '600', color: colors.textSecondary },
  preview: { padding: 16, borderRadius: 14, backgroundColor: colors.primarySoftBackground, gap: 8 },
  previewDate: { fontSize: 17, fontFamily: fonts.display, color: colors.textPrimary },
  previewSummary: { fontSize: 13, color: colors.primarySoftText },
  previewError: { fontSize: 13, color: colors.error },
  previewLink: { alignSelf: 'flex-start' },
  previewLinkText: { fontSize: 13, fontWeight: '600', color: colors.primarySoftText },
});
