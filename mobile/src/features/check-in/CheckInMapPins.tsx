import { Marker, Polyline } from 'react-native-maps';

import { colors } from '../../shared/theme';
import type { CheckIn } from './domain';

type CheckInMapPinsProps = {
  checkIns: CheckIn[];
  selectedCheckInId: string | null;
  onSelectCheckIn: (id: string) => void;
  testIDPrefix: string;
};

export function CheckInMapPins({ checkIns, selectedCheckInId, onSelectCheckIn, testIDPrefix }: CheckInMapPinsProps) {
  return (
    <>
      {checkIns.map((checkIn) => (
        <Marker
          key={checkIn.id}
          testID={`${testIDPrefix}-pin-${checkIn.id}`}
          coordinate={{ latitude: checkIn.latitude, longitude: checkIn.longitude }}
          pinColor={checkIn.id === selectedCheckInId ? colors.primary : undefined}
          onPress={() => onSelectCheckIn(checkIn.id)}
        />
      ))}
      {checkIns.length >= 2 && (
        <Polyline coordinates={checkIns.map((checkIn) => ({ latitude: checkIn.latitude, longitude: checkIn.longitude }))} />
      )}
    </>
  );
}
