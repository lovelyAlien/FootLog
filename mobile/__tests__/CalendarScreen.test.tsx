const mockPush = jest.fn();
// calendar.tsx calls useFocusEffect twice, always in the same textual order (dot lookup
// first, preview fetch second) thanks to React's hook-call-order guarantee. This mock
// captures each call site into its order-indexed slot so tests can manually re-invoke a
// specific effect via mockFocusEffects[n]?.() to simulate a refocus, mirroring the pattern
// in mobile/__tests__/TodayRoute.test.tsx (which only needs one slot since it has one call).
const mockFocusEffects: ((() => void | (() => void)) | undefined)[] = [];
let mockFocusEffectCursor = 0;
let mockRepository: { listLocalDatesWithCheckIns: jest.Mock; listByLocalDay: jest.Mock };

jest.mock('expo-router', () => {
  const { useEffect } = require('react');
  return {
    // calendar.tsx uses useFocusEffect so its effects re-run whenever the tab regains focus
    // (see mobile/app/(tabs)/index.tsx for the same pattern). Capturing each effect into an
    // order-indexed slot below lets tests manually re-invoke it to simulate a refocus, while
    // still auto-running on mount/deps-change (via the useEffect passthrough) so the existing
    // mount-time tests keep working unmodified.
    useFocusEffect: (effect: () => void | (() => void)) => {
      mockFocusEffects[mockFocusEffectCursor % 2] = effect;
      mockFocusEffectCursor += 1;
      useEffect(effect, [effect]);
    },
    useRouter: () => ({ push: mockPush }),
  };
});

jest.mock('../src/database/FootLogContext', () => ({
  useFootLogRepository: () => mockRepository,
}));

import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

import CalendarRoute from '../app/(tabs)/calendar';
import { localDateAndTimezone } from '../src/shared/localDate';
import { formatLocalTime } from '../src/shared/formatLocalTime';

describe('CalendarRoute', () => {
  beforeEach(() => {
    mockPush.mockClear();
    mockFocusEffectCursor = 0;
    mockFocusEffects.length = 0;
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
    const { localDate: today } = localDateAndTimezone();
    const [, , todayDayString] = today.split('-');
    const todayDay = Number(todayDayString);
    const otherDay = (todayDay % 28) + 1; // always in every month, always different from todayDay
    mockRepository = {
      listLocalDatesWithCheckIns: jest.fn().mockResolvedValue([]),
      listByLocalDay: jest.fn().mockResolvedValue([]),
    };

    const view = await render(<CalendarRoute />);
    await waitFor(() => expect(mockRepository.listLocalDatesWithCheckIns).toHaveBeenCalled());

    await fireEvent.press(view.getByRole('button', { name: new RegExp(` ${otherDay}일$`) }));

    expect(mockPush).not.toHaveBeenCalled();
    await waitFor(() => expect(view.getByRole('button', { name: '자세히 보기' })).toBeTruthy());

    await fireEvent.press(view.getByRole('button', { name: '자세히 보기' }));

    const expectedDateSuffix = `-${String(otherDay).padStart(2, '0')}`;
    expect(mockPush).toHaveBeenCalledWith(
      expect.objectContaining({
        pathname: '/day/[date]',
        params: expect.objectContaining({ date: expect.stringMatching(new RegExp(`${expectedDateSuffix}$`)) }),
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
    const { localDate: today } = localDateAndTimezone();
    const todayDay = Number(today.split('-')[2]);
    const otherDay = (todayDay % 28) + 1; // always in every month, always different from todayDay
    mockRepository = {
      listLocalDatesWithCheckIns: jest.fn().mockResolvedValue([]),
      listByLocalDay: jest.fn().mockResolvedValue([]),
    };

    const view = await render(<CalendarRoute />);
    await waitFor(() => expect(mockRepository.listLocalDatesWithCheckIns).toHaveBeenCalled());

    await fireEvent.press(view.getByRole('button', { name: new RegExp(` ${otherDay}일$`) }));

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
    const { localDate: today } = localDateAndTimezone();
    const todayDay = Number(today.split('-')[2]);
    const otherDay = (todayDay % 28) + 1; // always in every month, always different from todayDay
    mockRepository = {
      listLocalDatesWithCheckIns: jest.fn().mockResolvedValue([]),
      listByLocalDay: jest.fn()
        .mockResolvedValueOnce([]) // the default today-selection fetch on mount succeeds
        .mockRejectedValueOnce(new Error('db unavailable')) // the manual tap below fails
        .mockResolvedValue([]), // harmless default for any incidental extra call
    };

    const view = await render(<CalendarRoute />);
    await waitFor(() => expect(mockRepository.listByLocalDay).toHaveBeenCalledTimes(1));

    await fireEvent.press(view.getByRole('button', { name: new RegExp(` ${otherDay}일$`) }));

    await waitFor(() => expect(view.getByText('불러오지 못했어요.')).toBeTruthy());
    expect(view.getByText(/\d+년 \d+월/)).toBeTruthy();
  });

  it('lists multiple check-in times in ascending order', async () => {
    const { localDate: today } = localDateAndTimezone();
    const laterIso = `${today}T14:32:00.000Z`;
    const earlierIso = `${today}T00:55:00.000Z`;
    mockRepository = {
      listLocalDatesWithCheckIns: jest.fn().mockResolvedValue([today]),
      listByLocalDay: jest.fn().mockResolvedValue([
        { id: 'a', checkedInAt: laterIso, latitude: 37.5, longitude: 127.0, accuracyM: 5, createdAt: laterIso, syncStatus: 'pending' },
        { id: 'b', checkedInAt: earlierIso, latitude: 37.5, longitude: 127.0, accuracyM: 5, createdAt: earlierIso, syncStatus: 'pending' },
      ]),
    };

    const view = await render(<CalendarRoute />);

    await waitFor(() => expect(view.getByText(
      new RegExp(`${formatLocalTime(earlierIso)}, ${formatLocalTime(laterIso)}`),
    )).toBeTruthy());
  });

  it("reloads dots and the selected date's preview when the screen regains focus", async () => {
    const { localDate: today } = localDateAndTimezone();
    mockRepository = {
      listLocalDatesWithCheckIns: jest.fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([today]),
      listByLocalDay: jest.fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          {
            id: 'refocus-check-in',
            checkedInAt: `${today}T05:00:00.000Z`,
            latitude: 37.5, longitude: 127.0, accuracyM: 5,
            createdAt: `${today}T05:00:00.000Z`, syncStatus: 'pending',
          },
        ]),
    };

    const view = await render(<CalendarRoute />);

    await waitFor(() => expect(view.getByText('이날은 남겨진 발자국이 없어요.')).toBeTruthy());

    await act(async () => {
      mockFocusEffects[0]?.();
      mockFocusEffects[1]?.();
    });

    await waitFor(() => expect(view.getByText(/체크인 1개/)).toBeTruthy());
    expect(mockRepository.listLocalDatesWithCheckIns).toHaveBeenCalledTimes(2);
    expect(mockRepository.listByLocalDay).toHaveBeenCalledTimes(2);
  });

  it('truncates the time list and shows the overflow count when there are more than 4 check-ins', async () => {
    const { localDate: today } = localDateAndTimezone();
    const isoTimes = [
      `${today}T00:10:00.000Z`,
      `${today}T02:20:00.000Z`,
      `${today}T04:30:00.000Z`,
      `${today}T06:40:00.000Z`,
      `${today}T08:50:00.000Z`,
    ];
    mockRepository = {
      listLocalDatesWithCheckIns: jest.fn().mockResolvedValue([today]),
      listByLocalDay: jest.fn().mockResolvedValue(
        isoTimes.map((iso, index) => ({
          id: `check-in-${index}`,
          checkedInAt: iso,
          latitude: 37.5, longitude: 127.0, accuracyM: 5,
          createdAt: iso, syncStatus: 'pending',
        })),
      ),
    };

    const view = await render(<CalendarRoute />);

    await waitFor(() => expect(view.getByText(/체크인 5개/)).toBeTruthy());
    expect(view.getByText(/외 1건/)).toBeTruthy();
  });
});
