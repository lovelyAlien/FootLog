import { render, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { Text } from 'react-native';

const mockPush = jest.fn();
const mockGetLastNotificationResponseAsync = jest.fn();
const mockClearLastNotificationResponseAsync = jest.fn();
const mockAddNotificationResponseReceivedListener = jest.fn();
const mockOpenFootLogDatabase = jest.fn();
const mockRefreshIfEnabled = jest.fn();
let mockRootNavigationState: { key: string } | undefined;

jest.mock('expo-router', () => {
  const MockStack = ({ children }: { children: ReactNode }) => children;
  MockStack.Screen = () => null;

  return {
    Stack: MockStack,
    useRouter: () => ({ push: mockPush }),
    useRootNavigationState: () => mockRootNavigationState,
  };
});

jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  getLastNotificationResponseAsync: (...args: unknown[]) =>
    mockGetLastNotificationResponseAsync(...args),
  clearLastNotificationResponseAsync: (...args: unknown[]) =>
    mockClearLastNotificationResponseAsync(...args),
  addNotificationResponseReceivedListener: (...args: unknown[]) =>
    mockAddNotificationResponseReceivedListener(...args),
}));

jest.mock('../src/database/openDatabase', () => ({
  openFootLogDatabase: (...args: unknown[]) => mockOpenFootLogDatabase(...args),
}));

jest.mock('../src/database/FootLogContext', () => ({
  FootLogRepositoryProvider: ({ children }: { children: ReactNode }) => children,
}));

jest.mock('../src/features/notifications/NotificationSettingsContext', () => ({
  NotificationSettingsProvider: ({ children }: { children: ReactNode }) => children,
}));

jest.mock('../src/features/check-in/SQLiteCheckInRepository', () => ({
  SQLiteCheckInRepository: jest.fn(),
}));

jest.mock('../src/features/settings/AppSettingsRepository', () => ({
  AppSettingsRepository: jest.fn(),
}));

jest.mock('../src/features/notifications/ExpoNotificationScheduler', () => ({
  ExpoNotificationScheduler: jest.fn(() => ({
    refreshIfEnabled: (...args: unknown[]) => mockRefreshIfEnabled(...args),
  })),
}));

import RootLayout from '../app/_layout';

const checkInResponse = {
  notification: {
    request: {
      identifier: 'cold-start-check-in',
      content: { data: { kind: 'hourly-check-in', url: '/check-in' } },
    },
  },
};

describe('RootLayout notification startup', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetLastNotificationResponseAsync.mockResolvedValue(checkInResponse);
    mockClearLastNotificationResponseAsync.mockResolvedValue(undefined);
    mockAddNotificationResponseReceivedListener.mockReturnValue({ remove: jest.fn() });
    mockRefreshIfEnabled.mockResolvedValue(undefined);
    mockRootNavigationState = undefined;
  });

  it('captures a cold-start response before the database is ready and navigates after initialization', async () => {
    let resolveDatabase!: (database: object) => void;
    mockOpenFootLogDatabase.mockReturnValue(
      new Promise<object>((resolve) => { resolveDatabase = resolve; }),
    );

    const screen = await render(<RootLayout />);

    expect(screen.getByText('FootLog 준비 중')).toBeTruthy();
    expect(mockAddNotificationResponseReceivedListener).toHaveBeenCalledTimes(1);
    expect(mockGetLastNotificationResponseAsync).toHaveBeenCalledTimes(1);
    expect(mockPush).not.toHaveBeenCalled();

    resolveDatabase({});

    await waitFor(() => {
      expect(screen.queryByText('FootLog 준비 중')).toBeNull();
    });
    expect(mockRefreshIfEnabled).toHaveBeenCalledTimes(1);
    expect(mockPush).not.toHaveBeenCalled();

    mockRootNavigationState = { key: 'root-navigation' };
    await screen.rerender(<RootLayout />);

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/check-in'));
  });
});
