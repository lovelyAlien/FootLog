const mockAnimateToRegion = jest.fn();

jest.mock('react-native-maps', () => {
  const React = require('react');
  const { Pressable, View } = require('react-native');

  const MapView = React.forwardRef(
    ({ children, ...props }: { children?: React.ReactNode }, ref: React.Ref<unknown>) => {
      React.useImperativeHandle(ref, () => ({ animateToRegion: mockAnimateToRegion }));
      return <View testID="today-map" {...props}>{children}</View>;
    },
  );

  return {
    __esModule: true,
    default: MapView,
    Marker: ({ onPress, testID, ...props }: { onPress?: () => void; testID?: string }) => (
      <Pressable testID={testID} onPress={onPress} {...props} />
    ),
    Polyline: (props: object) => <View testID="today-map-polyline" {...props} />,
  };
});

const mockSnapToIndex = jest.fn();
const mockScrollToIndex = jest.fn();
const mockScrollToOffset = jest.fn();
const mockBottomSheetProps = jest.fn();
let capturedOnScrollToIndexFailed: ((info: { index: number; averageItemLength: number }) => void) | undefined;

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
    (props: React.ComponentProps<typeof FlatList> & { onScrollToIndexFailed?: (info: { index: number; averageItemLength: number }) => void }, ref: React.Ref<unknown>) => {
      capturedOnScrollToIndexFailed = props.onScrollToIndexFailed;
      React.useImperativeHandle(ref, () => ({
        scrollToIndex: mockScrollToIndex,
        scrollToOffset: mockScrollToOffset,
      }));
      return <FlatList {...props} />;
    },
  );

  return { __esModule: true, default: BottomSheet, BottomSheetFlatList };
});

import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

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
    mockScrollToOffset.mockClear();
    mockBottomSheetProps.mockClear();
    mockAnimateToRegion.mockClear();
    capturedOnScrollToIndexFailed = undefined;
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

  it('recovers from a failed scrollToIndex by falling back to scrollToOffset then retrying', async () => {
    jest.useFakeTimers();
    const first = buildCheckIn({ id: 'c1', checkedInAt: '2026-08-06T00:15:00.000Z' });
    const second = buildCheckIn({ id: 'c2', checkedInAt: '2026-08-06T08:45:00.000Z' });
    await render(
      <TodayMapSheet checkIns={[first, second]} initialRegion={region} onStartCheckIn={jest.fn()} />,
    );

    expect(capturedOnScrollToIndexFailed).toBeDefined();
    capturedOnScrollToIndexFailed?.({ index: 12, averageItemLength: 80 });

    expect(mockScrollToOffset).toHaveBeenCalledWith({ offset: 960, animated: false });
    expect(mockScrollToIndex).not.toHaveBeenCalledWith({ index: 12, animated: true });

    await act(() => { jest.advanceTimersByTime(50); });

    expect(mockScrollToIndex).toHaveBeenCalledWith({ index: 12, animated: true });

    jest.useRealTimers();
  });

  it('recenters the map when a list row is tapped', async () => {
    const first = buildCheckIn({ id: 'c1', checkedInAt: '2026-08-06T00:15:00.000Z', latitude: 37.1, longitude: 127.1 });
    const second = buildCheckIn({ id: 'c2', checkedInAt: '2026-08-06T08:45:00.000Z', latitude: 37.2, longitude: 127.2 });
    const view = await render(
      <TodayMapSheet checkIns={[first, second]} initialRegion={region} onStartCheckIn={jest.fn()} />,
    );

    await fireEvent.press(view.getByTestId('today-map-list-c2'));

    expect(mockAnimateToRegion).toHaveBeenCalledWith(
      { latitude: 37.2, longitude: 127.2, latitudeDelta: 0.02, longitudeDelta: 0.02 },
      300,
    );
  });

  it('shows the not-a-real-route caption only when there are check-ins to connect', async () => {
    const emptyView = await render(
      <TodayMapSheet checkIns={[]} initialRegion={region} onStartCheckIn={jest.fn()} />,
    );
    expect(emptyView.queryByText('선은 실제 이동 경로가 아니라 기록 지점을 시간순으로 연결한 선이에요.')).toBeNull();

    const checkIn = buildCheckIn({ id: 'c1', checkedInAt: '2026-08-06T00:15:00.000Z' });
    const filledView = await render(
      <TodayMapSheet checkIns={[checkIn]} initialRegion={region} onStartCheckIn={jest.fn()} />,
    );
    expect(filledView.getByText('선은 실제 이동 경로가 아니라 기록 지점을 시간순으로 연결한 선이에요.')).toBeTruthy();
  });

  it('does not recenter the map on first mount, but does animate to a refined initialRegion once it changes', async () => {
    const view = await render(
      <TodayMapSheet checkIns={[]} initialRegion={region} onStartCheckIn={jest.fn()} />,
    );

    // MapView's own `initialRegion` prop already covers the mount case — recentering
    // imperatively here too would be redundant and would reproduce the mount-time animation
    // bug this test guards against.
    expect(mockAnimateToRegion).not.toHaveBeenCalled();

    const refinedRegion = { latitude: 37.1, longitude: 127.1, latitudeDelta: 0.02, longitudeDelta: 0.02 };
    await view.rerender(
      <TodayMapSheet checkIns={[]} initialRegion={refinedRegion} onStartCheckIn={jest.fn()} />,
    );

    expect(mockAnimateToRegion).toHaveBeenCalledTimes(1);
    expect(mockAnimateToRegion).toHaveBeenCalledWith(refinedRegion, 300);
  });
});
