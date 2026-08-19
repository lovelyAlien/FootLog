jest.mock('react-native-maps', () => {
  const React = require('react');
  const { Pressable, View } = require('react-native');

  return {
    __esModule: true,
    default: ({ children, ...props }: { children?: React.ReactNode }) => (
      <View testID="today-map" {...props}>{children}</View>
    ),
    Marker: ({ onPress, testID, ...props }: { onPress?: () => void; testID?: string }) => (
      <Pressable testID={testID} onPress={onPress} {...props} />
    ),
    Polyline: (props: object) => <View testID="today-map-polyline" {...props} />,
  };
});

const mockSnapToIndex = jest.fn();
const mockScrollToIndex = jest.fn();
const mockBottomSheetProps = jest.fn();

jest.mock('@gorhom/bottom-sheet', () => {
  const React = require('react');
  const { View, FlatList } = require('react-native');

  const BottomSheet = React.forwardRef(
    ({ children, ...rest }: { children?: React.ReactNode }, ref: React.Ref<unknown>) => {
      mockBottomSheetProps(rest);
      React.useImperativeHandle(ref, () => ({ snapToIndex: mockSnapToIndex }));
      return <View testID="today-bottom-sheet">{children}</View>;
    },
  );

  const BottomSheetFlatList = React.forwardRef(
    (props: React.ComponentProps<typeof FlatList>, ref: React.Ref<unknown>) => {
      React.useImperativeHandle(ref, () => ({ scrollToIndex: mockScrollToIndex }));
      return <FlatList {...props} />;
    },
  );

  return { __esModule: true, default: BottomSheet, BottomSheetFlatList };
});

import { fireEvent, render, waitFor } from '@testing-library/react-native';

import { TodayMapSheet } from '../src/features/check-in/TodayMapSheet';
import type { CheckIn } from '../src/features/check-in/domain';

const region = { latitude: 37.5665, longitude: 126.978, latitudeDelta: 0.02, longitudeDelta: 0.02 };

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

describe('TodayMapSheet', () => {
  beforeEach(() => {
    mockSnapToIndex.mockClear();
    mockScrollToIndex.mockClear();
    mockBottomSheetProps.mockClear();
  });

  it('disables dynamic sizing so the sheet respects its fixed snapPoints', async () => {
    // enableDynamicSizing defaults to true in @gorhom/bottom-sheet, and combined with the
    // conditional BottomSheetFlatList/empty-state content, that collapses the real sheet to
    // zero visible height on device (confirmed in manual simulator QA — not reproducible
    // against the mocked library, hence this explicit prop assertion as a regression guard).
    await render(
      <TodayMapSheet checkIns={[]} initialRegion={region} onStartCheckIn={jest.fn()} />,
    );

    expect(mockBottomSheetProps).toHaveBeenCalledWith(
      expect.objectContaining({ enableDynamicSizing: false }),
    );
  });

  it('shows the empty state when there are no check-ins today', async () => {
    const view = await render(
      <TodayMapSheet checkIns={[]} initialRegion={region} onStartCheckIn={jest.fn()} />,
    );

    expect(view.getByText('오늘의 발자국이 아직 없어요.')).toBeTruthy();
  });

  it('lists today check-ins in chronological order', async () => {
    const first = buildCheckIn({ id: 'c1', checkedInAt: '2026-08-06T08:45:00.000Z' });
    const second = buildCheckIn({ id: 'c2', checkedInAt: '2026-08-06T00:15:00.000Z' });
    const view = await render(
      <TodayMapSheet checkIns={[first, second]} initialRegion={region} onStartCheckIn={jest.fn()} />,
    );

    expect(view.getAllByTestId('check-in-time').map((item) => item.props.children)).toEqual([
      '09:15',
      '17:45',
    ]);
  });

  it('expands the sheet and scrolls to the matching row when a pin is tapped', async () => {
    const first = buildCheckIn({ id: 'c1', checkedInAt: '2026-08-06T00:15:00.000Z' });
    const second = buildCheckIn({ id: 'c2', checkedInAt: '2026-08-06T08:45:00.000Z' });
    const view = await render(
      <TodayMapSheet checkIns={[first, second]} initialRegion={region} onStartCheckIn={jest.fn()} />,
    );

    await fireEvent.press(view.getByTestId('today-map-pin-c2'));

    expect(mockSnapToIndex).toHaveBeenCalledWith(1);
    expect(mockScrollToIndex).toHaveBeenCalledWith({ index: 1, animated: true });
  });

  it('highlights the row selected by tapping its pin', async () => {
    const checkIn = buildCheckIn({ id: 'c1', checkedInAt: '2026-08-06T00:15:00.000Z' });
    const view = await render(
      <TodayMapSheet checkIns={[checkIn]} initialRegion={region} onStartCheckIn={jest.fn()} />,
    );

    await fireEvent.press(view.getByTestId('today-map-pin-c1'));

    await waitFor(() => {
      const row = view.getByTestId('today-map-list-c1');
      const flattenedStyle = [row.props.style].flat();
      expect(flattenedStyle).toEqual(expect.arrayContaining([expect.objectContaining({ borderColor: '#2e6af0' })]));
    });
  });

  it('opens /check-in from the FAB', async () => {
    const onStartCheckIn = jest.fn();
    const view = await render(
      <TodayMapSheet checkIns={[]} initialRegion={region} onStartCheckIn={onStartCheckIn} />,
    );

    await fireEvent.press(view.getByRole('button', { name: '지금 체크인' }));
    expect(onStartCheckIn).toHaveBeenCalledTimes(1);
  });

  it('opens reminder settings from the header', async () => {
    const onOpenReminderSettings = jest.fn();
    const view = await render(
      <TodayMapSheet
        checkIns={[]}
        initialRegion={region}
        onStartCheckIn={jest.fn()}
        onOpenReminderSettings={onOpenReminderSettings}
      />,
    );

    await fireEvent.press(view.getByRole('button', { name: '알림 설정' }));
    expect(onOpenReminderSettings).toHaveBeenCalledTimes(1);
  });
});
