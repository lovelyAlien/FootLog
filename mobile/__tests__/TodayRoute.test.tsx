const mockPush = jest.fn();
let mockRepository: { listByLocalDay: jest.Mock };
let mockFocusEffect: (() => void | (() => void)) | undefined;
let mockRequestForegroundPermission: jest.Mock;
let mockGetCurrentFix: jest.Mock;

jest.mock('expo-router', () => ({
  useFocusEffect: (effect: () => void | (() => void)) => { mockFocusEffect = effect; },
  useRouter: () => ({ push: mockPush }),
}));

jest.mock('../src/database/FootLogContext', () => ({
  useFootLogRepository: () => mockRepository,
}));

jest.mock('react-native-maps', () => {
  const React = require('react');
  const { View } = require('react-native');

  return {
    __esModule: true,
    default: ({ children, ...props }: { children?: React.ReactNode }) => (
      <View testID="today-map" {...props}>{children}</View>
    ),
    Marker: (props: object) => <View testID="today-map-pin" {...props} />,
    Polyline: (props: object) => <View testID="today-map-polyline" {...props} />,
  };
});

jest.mock('@gorhom/bottom-sheet', () => {
  const React = require('react');
  const { View, FlatList } = require('react-native');

  const BottomSheet = React.forwardRef(
    ({ children }: { children?: React.ReactNode }, ref: React.Ref<unknown>) => {
      React.useImperativeHandle(ref, () => ({ snapToIndex: jest.fn() }));
      return <View>{children}</View>;
    },
  );

  const BottomSheetFlatList = React.forwardRef(
    (props: React.ComponentProps<typeof FlatList>, ref: React.Ref<unknown>) => {
      React.useImperativeHandle(ref, () => ({ scrollToIndex: jest.fn() }));
      return <FlatList {...props} />;
    },
  );

  return { __esModule: true, default: BottomSheet, BottomSheetFlatList };
});

jest.mock('../src/features/check-in/ExpoLocationGateway', () => ({
  ExpoLocationGateway: jest.fn().mockImplementation(() => ({
    requestForegroundPermission: (...args: unknown[]) => mockRequestForegroundPermission(...args),
    getCurrentFix: (...args: unknown[]) => mockGetCurrentFix(...args),
  })),
}));

import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

import TodayRoute from '../app/(tabs)/index';
import type { CheckIn } from '../src/features/check-in/domain';

const firstCheckIn: CheckIn = {
  id: 'first',
  checkedInAt: '2026-08-06T00:15:00.000Z',
  capturedAt: '2026-08-06T00:14:58.000Z',
  latitude: 37.5,
  longitude: 127.0,
  accuracyM: 12,
  createdAt: '2026-08-06T00:15:00.000Z',
  syncStatus: 'pending',
};

describe('TodayRoute', () => {
  beforeEach(() => {
    mockPush.mockClear();
    mockRequestForegroundPermission = jest.fn().mockResolvedValue('granted');
    mockGetCurrentFix = jest.fn().mockResolvedValue({
      latitude: 37.5665, longitude: 126.978, accuracyM: 10, capturedAt: '2026-08-06T00:00:00.000Z',
    });
    mockRepository = { listByLocalDay: jest.fn().mockResolvedValue([firstCheckIn]) };
  });

  it('centers the map on the current location when permission is granted', async () => {
    const view = await render(<TodayRoute />);
    await act(async () => { mockFocusEffect?.(); });

    await waitFor(() => {
      expect(view.getByTestId('today-map').props.initialRegion).toEqual({
        latitude: 37.5665, longitude: 126.978, latitudeDelta: 0.02, longitudeDelta: 0.02,
      });
    });
  });

  it('falls back to the most recent check-in when location permission is denied', async () => {
    mockRequestForegroundPermission.mockResolvedValue('denied');
    const view = await render(<TodayRoute />);
    await act(async () => { mockFocusEffect?.(); });

    await waitFor(() => {
      expect(view.getByTestId('today-map').props.initialRegion).toEqual({
        latitude: 37.5, longitude: 127.0, latitudeDelta: 0.02, longitudeDelta: 0.02,
      });
    });
    expect(mockGetCurrentFix).not.toHaveBeenCalled();
  });

  it('opens /check-in from the FAB', async () => {
    const view = await render(<TodayRoute />);
    await act(async () => { mockFocusEffect?.(); });
    await waitFor(() => expect(view.getByTestId('today-map')).toBeTruthy());

    await fireEvent.press(view.getByRole('button', { name: '지금 체크인' }));
    expect(mockPush).toHaveBeenCalledWith('/check-in');
  });

  it('opens reminder settings from the header', async () => {
    const view = await render(<TodayRoute />);
    await act(async () => { mockFocusEffect?.(); });
    await waitFor(() => expect(view.getByTestId('today-map')).toBeTruthy());

    await fireEvent.press(view.getByRole('button', { name: '알림 설정' }));
    expect(mockPush).toHaveBeenCalledWith('/settings/reminders');
  });

  it('refreshes check-ins after the route regains focus', async () => {
    mockRepository.listByLocalDay
      .mockResolvedValueOnce([firstCheckIn])
      .mockResolvedValueOnce([]);

    await render(<TodayRoute />);

    await act(async () => { mockFocusEffect?.(); });
    await waitFor(() => expect(mockRepository.listByLocalDay).toHaveBeenCalledTimes(1));

    await act(async () => { mockFocusEffect?.(); });
    await waitFor(() => expect(mockRepository.listByLocalDay).toHaveBeenCalledTimes(2));
  });
});
