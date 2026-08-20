const mockPush = jest.fn();
let mockRepository: { listLocalDatesWithCheckIns: jest.Mock; listByLocalDay: jest.Mock };

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
}));

jest.mock('../src/database/FootLogContext', () => ({
  useFootLogRepository: () => mockRepository,
}));

import { fireEvent, render, waitFor } from '@testing-library/react-native';

import CalendarRoute from '../app/(tabs)/calendar';
import { localDateAndTimezone } from '../src/shared/localDate';

describe('CalendarRoute', () => {
  beforeEach(() => {
    mockPush.mockClear();
  });

  it('shows a dot only for dates with check-ins', async () => {
    mockRepository = {
      listLocalDatesWithCheckIns: jest.fn().mockResolvedValue(['2026-08-05', '2026-08-12']),
      listByLocalDay: jest.fn().mockResolvedValue([]),
    };

    const view = await render(<CalendarRoute />);

    await waitFor(() => expect(view.queryByTestId('calendar-dot-2026-08-05')).toBeTruthy());
    expect(view.queryByTestId('calendar-dot-2026-08-12')).toBeTruthy();
    expect(view.queryByTestId('calendar-dot-2026-08-06')).toBeNull();
  });

  it('selects a date on tap and navigates to its day route via 자세히 보기', async () => {
    mockRepository = {
      listLocalDatesWithCheckIns: jest.fn().mockResolvedValue([]),
      listByLocalDay: jest.fn().mockResolvedValue([]),
    };

    const view = await render(<CalendarRoute />);
    await waitFor(() => expect(mockRepository.listLocalDatesWithCheckIns).toHaveBeenCalled());

    await fireEvent.press(view.getByRole('button', { name: / 1일$/ }));

    expect(mockPush).not.toHaveBeenCalled();
    await waitFor(() => expect(view.getByRole('button', { name: '자세히 보기' })).toBeTruthy());

    await fireEvent.press(view.getByRole('button', { name: '자세히 보기' }));

    expect(mockPush).toHaveBeenCalledWith(
      expect.objectContaining({
        pathname: '/day/[date]',
        params: expect.objectContaining({ date: expect.stringMatching(/-01$/) }),
      }),
    );
  });

  it('still renders the grid when the dot lookup fails', async () => {
    mockRepository = {
      listLocalDatesWithCheckIns: jest.fn().mockRejectedValue(new Error('db unavailable')),
      listByLocalDay: jest.fn().mockResolvedValue([]),
    };

    const view = await render(<CalendarRoute />);

    await waitFor(() => expect(mockRepository.listLocalDatesWithCheckIns).toHaveBeenCalled());
    expect(view.getByText(/\d+년 \d+월/)).toBeTruthy();
  });

  it('reloads dots when navigating to the previous month', async () => {
    mockRepository = {
      listLocalDatesWithCheckIns: jest.fn().mockResolvedValue([]),
      listByLocalDay: jest.fn().mockResolvedValue([]),
    };
    const view = await render(<CalendarRoute />);
    await waitFor(() => expect(mockRepository.listLocalDatesWithCheckIns).toHaveBeenCalledTimes(1));

    await fireEvent.press(view.getByRole('button', { name: '이전 달' }));

    await waitFor(() => expect(mockRepository.listLocalDatesWithCheckIns).toHaveBeenCalledTimes(2));
  });

  it('deselects the date and resets the preview when the month changes', async () => {
    mockRepository = {
      listLocalDatesWithCheckIns: jest.fn().mockResolvedValue([]),
      listByLocalDay: jest.fn().mockResolvedValue([]),
    };
    const view = await render(<CalendarRoute />);
    await waitFor(() => expect(view.getByRole('button', { name: '자세히 보기' })).toBeTruthy());

    await fireEvent.press(view.getByRole('button', { name: '이전 달' }));

    await waitFor(() => expect(view.queryByRole('button', { name: '자세히 보기' })).toBeNull());
  });

  it('defaults to today selected and shows its check-in summary when today is in the displayed month', async () => {
    const { localDate: today } = localDateAndTimezone();
    mockRepository = {
      listLocalDatesWithCheckIns: jest.fn().mockResolvedValue([today]),
      listByLocalDay: jest.fn().mockResolvedValue([
        {
          id: 'check-in-1',
          checkedInAt: `${today}T00:55:00.000Z`,
          latitude: 37.5, longitude: 127.0, accuracyM: 5,
          createdAt: `${today}T00:55:00.000Z`, syncStatus: 'pending',
        },
      ]),
    };

    const view = await render(<CalendarRoute />);

    await waitFor(() => expect(mockRepository.listByLocalDay).toHaveBeenCalledWith(today, expect.any(String)));
    await waitFor(() => expect(view.getByText(/체크인 1개/)).toBeTruthy());
  });

  it('shows an empty-state message and 자세히 보기 for a date with no check-ins', async () => {
    mockRepository = {
      listLocalDatesWithCheckIns: jest.fn().mockResolvedValue([]),
      listByLocalDay: jest.fn().mockResolvedValue([]),
    };

    const view = await render(<CalendarRoute />);
    await waitFor(() => expect(mockRepository.listLocalDatesWithCheckIns).toHaveBeenCalled());

    await fireEvent.press(view.getByRole('button', { name: / 1일$/ }));

    await waitFor(() => expect(view.getByText('이날은 남겨진 발자국이 없어요.')).toBeTruthy());
    expect(view.getByRole('button', { name: '자세히 보기' })).toBeTruthy();
  });

  it('falls back to no selection (looks like the old screen) when the default today fetch fails', async () => {
    mockRepository = {
      listLocalDatesWithCheckIns: jest.fn().mockResolvedValue([]),
      listByLocalDay: jest.fn().mockRejectedValue(new Error('db unavailable')),
    };

    const view = await render(<CalendarRoute />);

    await waitFor(() => expect(mockRepository.listByLocalDay).toHaveBeenCalled());
    await waitFor(() => expect(view.queryByRole('button', { name: '자세히 보기' })).toBeNull());
    expect(view.queryByText('불러오지 못했어요.')).toBeNull();
    expect(view.getByText(/\d+년 \d+월/)).toBeTruthy();
  });

  it('shows an inline preview error without breaking the grid when a manually selected date fails to load', async () => {
    mockRepository = {
      listLocalDatesWithCheckIns: jest.fn().mockResolvedValue([]),
      listByLocalDay: jest.fn()
        .mockResolvedValueOnce([]) // the default today-selection fetch on mount succeeds
        .mockRejectedValueOnce(new Error('db unavailable')), // the manual tap below fails
    };

    const view = await render(<CalendarRoute />);
    await waitFor(() => expect(mockRepository.listByLocalDay).toHaveBeenCalledTimes(1));

    await fireEvent.press(view.getByRole('button', { name: / 1일$/ }));

    await waitFor(() => expect(view.getByText('불러오지 못했어요.')).toBeTruthy());
    expect(view.getByText(/\d+년 \d+월/)).toBeTruthy();
  });
});
