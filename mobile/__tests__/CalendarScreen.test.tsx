const mockPush = jest.fn();
let mockRepository: { listLocalDatesWithCheckIns: jest.Mock };

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
}));

jest.mock('../src/database/FootLogContext', () => ({
  useFootLogRepository: () => mockRepository,
}));

import { fireEvent, render, waitFor } from '@testing-library/react-native';

import CalendarRoute from '../app/(tabs)/calendar';

describe('CalendarRoute', () => {
  beforeEach(() => {
    mockPush.mockClear();
  });

  it('shows a dot only for dates with check-ins', async () => {
    mockRepository = { listLocalDatesWithCheckIns: jest.fn().mockResolvedValue(['2026-08-05', '2026-08-12']) };

    const view = await render(<CalendarRoute />);

    await waitFor(() => expect(view.queryByTestId('calendar-dot-2026-08-05')).toBeTruthy());
    expect(view.queryByTestId('calendar-dot-2026-08-12')).toBeTruthy();
    expect(view.queryByTestId('calendar-dot-2026-08-06')).toBeNull();
  });

  it('navigates to the day route for the 1st of the displayed month', async () => {
    mockRepository = { listLocalDatesWithCheckIns: jest.fn().mockResolvedValue([]) };

    const view = await render(<CalendarRoute />);
    await waitFor(() => expect(mockRepository.listLocalDatesWithCheckIns).toHaveBeenCalled());

    await fireEvent.press(view.getByRole('button', { name: / 1일$/ }));

    expect(mockPush).toHaveBeenCalledWith(
      expect.objectContaining({
        pathname: '/day/[date]',
        params: expect.objectContaining({ date: expect.stringMatching(/-01$/) }),
      }),
    );
  });

  it('still renders the grid when the dot lookup fails', async () => {
    mockRepository = { listLocalDatesWithCheckIns: jest.fn().mockRejectedValue(new Error('db unavailable')) };

    const view = await render(<CalendarRoute />);

    await waitFor(() => expect(mockRepository.listLocalDatesWithCheckIns).toHaveBeenCalled());
    expect(view.getByText(/\d+년 \d+월/)).toBeTruthy();
  });

  it('reloads dots when navigating to the previous month', async () => {
    mockRepository = { listLocalDatesWithCheckIns: jest.fn().mockResolvedValue([]) };
    const view = await render(<CalendarRoute />);
    await waitFor(() => expect(mockRepository.listLocalDatesWithCheckIns).toHaveBeenCalledTimes(1));

    await fireEvent.press(view.getByRole('button', { name: '이전 달' }));

    await waitFor(() => expect(mockRepository.listLocalDatesWithCheckIns).toHaveBeenCalledTimes(2));
  });
});
