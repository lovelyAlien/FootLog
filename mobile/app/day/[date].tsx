import { useLocalSearchParams } from 'expo-router';

import { DailyDetailScreen } from '../../src/features/daily-reflection/DailyDetailScreen';

export default function DayRoute() {
  const { date } = useLocalSearchParams<{ date: string }>();
  return <DailyDetailScreen localDate={date} />;
}
