const mockReplace = jest.fn();

jest.mock('react-native-maps', () => {
  const React = require('react');
  const { View } = require('react-native');

  return {
    __esModule: true,
    default: ({ children, ...props }: { children?: React.ReactNode }) => (
      <View testID="check-in-map" {...props}>{children}</View>
    ),
    Marker: (props: object) => <View testID="check-in-map-pin" {...props} />,
    Circle: (props: object) => <View testID="check-in-accuracy-circle" {...props} />,
  };
});

jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace }),
}));

jest.mock('../src/database/FootLogContext', () => ({
  useFootLogRepository: () => ({
    save: jest.fn().mockResolvedValue(undefined),
    listByLocalDay: jest.fn().mockResolvedValue([]),
    deleteById: jest.fn(),
    listLocalDatesWithCheckIns: jest.fn().mockResolvedValue([]),
  }),
}));

jest.mock('../src/features/check-in/ExpoLocationGateway', () => ({
  ExpoLocationGateway: jest.fn().mockImplementation(() => ({
    requestForegroundPermission: jest.fn().mockResolvedValue('granted'),
    getCurrentFix: jest.fn().mockResolvedValue({
      latitude: 37.5, longitude: 127.0, accuracyM: 10, capturedAt: '2026-08-16T09:00:00.000Z',
    }),
  })),
}));

import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

import CheckInRoute from '../app/check-in';
import { localDateAndTimezone } from '../src/shared/localDate';

describe('CheckInRoute', () => {
  it('routes 오늘의 발자국 보기 to the day-detail screen for today', async () => {
    const view = await render(<CheckInRoute />);

    await waitFor(() => expect(view.getByRole('button', { name: '이 위치에 체크인' })).toBeTruthy());
    await act(async () => {
      await fireEvent.press(view.getByRole('button', { name: '이 위치에 체크인' }));
    });
    await waitFor(() => expect(view.getByRole('button', { name: '오늘의 발자국 보기' })).toBeTruthy());

    await act(async () => {
      await fireEvent.press(view.getByRole('button', { name: '오늘의 발자국 보기' }));
    });

    expect(mockReplace).toHaveBeenCalledWith({
      pathname: '/day/[date]',
      params: { date: localDateAndTimezone().localDate },
    });
  });
});
