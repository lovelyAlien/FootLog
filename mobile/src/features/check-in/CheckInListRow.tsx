import { Pressable, StyleSheet, Text } from 'react-native';

import { formatLocalTime } from '../../shared/formatLocalTime';
import { colors, fonts } from '../../shared/theme';
import type { CheckIn } from './domain';

type CheckInListRowProps = {
  checkIn: CheckIn;
  isSelected: boolean;
  onPress: (id: string) => void;
};

export function CheckInListRow({ checkIn, isSelected, onPress }: CheckInListRowProps) {
  return (
    <Pressable
      testID={`today-map-list-${checkIn.id}`}
      accessibilityRole="button"
      accessibilityLabel={`${formatLocalTime(checkIn.checkedInAt)} 체크인`}
      onPress={() => onPress(checkIn.id)}
      style={[styles.row, isSelected && styles.rowSelected]}
    >
      <Text testID="check-in-time" style={styles.time}>{formatLocalTime(checkIn.checkedInAt)}</Text>
      <Text style={styles.accuracy}>정확도 약 {Math.round(checkIn.accuracyM)}m</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: 16, gap: 4 },
  rowSelected: { borderColor: colors.primary, backgroundColor: colors.primarySoftBackground },
  time: { fontSize: 26, fontFamily: fonts.display, color: colors.textPrimary },
  accuracy: { fontSize: 14, color: colors.textSecondary },
});
