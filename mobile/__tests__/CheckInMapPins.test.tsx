jest.mock('react-native-maps', () => {
  const React = require('react');
  const { Pressable, View } = require('react-native');

  return {
    __esModule: true,
    default: ({ children, ...props }: { children?: React.ReactNode }) => (
      <View testID="mock-map" {...props}>{children}</View>
    ),
    Marker: ({ onPress, testID, ...props }: { onPress?: () => void; testID?: string }) => (
      <Pressable testID={testID} onPress={onPress} {...props} />
    ),
    Polyline: (props: object) => <View testID="mock-polyline" {...props} />,
  };
});

import { fireEvent, render } from '@testing-library/react-native';
import MapView from 'react-native-maps';

import { CheckInMapPins } from '../src/features/check-in/CheckInMapPins';
import type { CheckIn } from '../src/features/check-in/domain';
import { colors } from '../src/shared/theme';

function buildCheckIn(overrides: Partial<CheckIn> & Pick<CheckIn, 'id' | 'checkedInAt'>): CheckIn {
  return {
    latitude: 37.5,
    longitude: 127.0,
    accuracyM: 10,
    capturedAt: overrides.checkedInAt,
    createdAt: overrides.checkedInAt,
    syncStatus: 'pending',
    ...overrides,
  };
}

describe('CheckInMapPins', () => {
  it('renders one pin per check-in with the given testID prefix', async () => {
    const checkIn1 = buildCheckIn({ id: 'c1', checkedInAt: '2026-08-16T09:00:00.000Z' });
    const checkIn2 = buildCheckIn({ id: 'c2', checkedInAt: '2026-08-16T10:00:00.000Z' });
    const view = await render(
      <MapView>
        <CheckInMapPins
          checkIns={[checkIn1, checkIn2]}
          selectedCheckInId={null}
          onSelectCheckIn={jest.fn()}
          testIDPrefix="today-map"
        />
      </MapView>,
    );

    expect(view.getByTestId('today-map-pin-c1')).toBeTruthy();
    expect(view.getByTestId('today-map-pin-c2')).toBeTruthy();
  });

  it('colors the selected pin with the primary color and unselected pins with the on-brand default', async () => {
    const checkIn1 = buildCheckIn({ id: 'c1', checkedInAt: '2026-08-16T09:00:00.000Z' });
    const checkIn2 = buildCheckIn({ id: 'c2', checkedInAt: '2026-08-16T10:00:00.000Z' });
    const view = await render(
      <MapView>
        <CheckInMapPins
          checkIns={[checkIn1, checkIn2]}
          selectedCheckInId="c2"
          onSelectCheckIn={jest.fn()}
          testIDPrefix="today-map"
        />
      </MapView>,
    );

    expect(view.getByTestId('today-map-pin-c1').props.pinColor).toBe(colors.primarySoftText);
    expect(view.getByTestId('today-map-pin-c2').props.pinColor).toBe(colors.primary);
  });

  it('calls onSelectCheckIn with the tapped check-in id', async () => {
    const checkIn1 = buildCheckIn({ id: 'c1', checkedInAt: '2026-08-16T09:00:00.000Z' });
    const onSelectCheckIn = jest.fn();
    const view = await render(
      <MapView>
        <CheckInMapPins
          checkIns={[checkIn1]}
          selectedCheckInId={null}
          onSelectCheckIn={onSelectCheckIn}
          testIDPrefix="today-map"
        />
      </MapView>,
    );

    await fireEvent.press(view.getByTestId('today-map-pin-c1'));
    expect(onSelectCheckIn).toHaveBeenCalledWith('c1');
  });
});
