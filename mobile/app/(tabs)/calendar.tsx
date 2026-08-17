import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useFootLogRepository } from '../../src/database/FootLogContext';
import { localDateAndTimezone } from '../../src/shared/localDate';

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

export default function CalendarRoute() {
  const router = useRouter();
  const repository = useFootLogRepository();
  const { localDate: todayLocalDate, timezone } = localDateAndTimezone();
  const [todayYear, todayMonth] = todayLocalDate.split('-').map(Number);
  const [year, setYear] = useState(todayYear);
  const [month, setMonth] = useState(todayMonth);
  const [datesWithCheckIns, setDatesWithCheckIns] = useState<Set<string>>(new Set());

  const loadDots = useCallback(() => {
    void repository.listLocalDatesWithCheckIns(year, month, timezone)
      .then((dates) => setDatesWithCheckIns(new Set(dates)))
      .catch(() => setDatesWithCheckIns(new Set()));
  }, [repository, year, month, timezone]);

  useEffect(() => { loadDots(); }, [loadDots]);

  const goToPreviousMonth = () => {
    if (month === 1) { setYear((value) => value - 1); setMonth(12); } else { setMonth((value) => value - 1); }
  };

  const goToNextMonth = () => {
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
          return (
            <Pressable
              key={localDate}
              accessibilityRole="button"
              accessibilityLabel={`${year}년 ${month}월 ${day}일`}
              onPress={() => router.push({ pathname: '/day/[date]', params: { date: localDate } })}
              style={styles.cell}
            >
              <Text style={styles.dayText}>{day}</Text>
              {hasCheckIns && <View testID={`calendar-dot-${localDate}`} style={styles.dot} />}
            </Pressable>
          );
        })}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#ffffff', padding: 16, gap: 16 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  navText: { fontSize: 24, color: '#2e6af0', paddingHorizontal: 12 },
  title: { fontSize: 20, fontWeight: '700', color: '#1b1b1b' },
  weekdayRow: { flexDirection: 'row' },
  weekdayLabel: { flex: 1, textAlign: 'center', fontSize: 13, color: '#8a8a8a' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: `${100 / 7}%`, aspectRatio: 1, alignItems: 'center', justifyContent: 'center', gap: 4 },
  dayText: { fontSize: 15, color: '#1b1b1b' },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#2e6af0' },
});
