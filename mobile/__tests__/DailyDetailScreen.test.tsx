jest.mock('react-native-maps', () => {
  const React = require('react');
  const { Pressable, View } = require('react-native');

  return {
    __esModule: true,
    default: ({ children, ...props }: { children?: React.ReactNode }) => (
      <View testID="daily-detail-map" {...props}>{children}</View>
    ),
    Marker: ({ onPress, testID, ...props }: { onPress?: () => void; testID?: string }) => (
      <Pressable testID={testID} onPress={onPress} {...props} />
    ),
    Polyline: (props: object) => <View testID="daily-detail-polyline" {...props} />,
  };
});

const mockUseDailyDetail = jest.fn();
jest.mock('../src/features/daily-reflection/useDailyDetail', () => ({
  useDailyDetail: () => mockUseDailyDetail(),
}));
jest.mock('../src/features/daily-reflection/DailyReflectionContext', () => ({
  useDailyReflectionDependencies: () => ({
    reflectionRepository: { getByLocalDate: jest.fn(), save: jest.fn(), deleteByLocalDate: jest.fn() },
    draftRepository: { getDraft: jest.fn(), saveDraft: jest.fn(), clearDraft: jest.fn() },
    uuid: () => 'uuid',
    now: () => '2026-08-16T00:00:00.000Z',
  }),
}));

import { fireEvent, render, waitFor } from '@testing-library/react-native';

import { DailyDetailScreen } from '../src/features/daily-reflection/DailyDetailScreen';
import type { CheckIn } from '../src/features/check-in/domain';

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

describe('DailyDetailScreen', () => {
  it('shows a loading message while loading', async () => {
    mockUseDailyDetail.mockReturnValue({ state: { status: 'loading' }, reload: jest.fn() });
    const view = await render(<DailyDetailScreen localDate="2026-08-16" />);
    expect(view.getByText('이날의 기록을 불러오는 중이에요.')).toBeTruthy();
  });

  it('shows an error message with a working retry on failure', async () => {
    const reload = jest.fn();
    mockUseDailyDetail.mockReturnValue({ state: { status: 'error' }, reload });
    const view = await render(<DailyDetailScreen localDate="2026-08-16" />);

    expect(view.getByText('이날의 기록을 불러오지 못했어요.')).toBeTruthy();
    await fireEvent.press(view.getByRole('button', { name: '다시 시도' }));
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('shows the empty state when there are no check-ins', async () => {
    mockUseDailyDetail.mockReturnValue({
      state: { status: 'loaded', checkIns: [], reflection: null, draft: null, activityWindow: { startHour: 7, endHour: 23 } },
      reload: jest.fn(),
    });
    const view = await render(<DailyDetailScreen localDate="2026-08-16" />);
    expect(view.getByText('이날은 남겨진 발자국이 없어요.')).toBeTruthy();
  });

  it('shows daily summary facts for a day with check-ins', async () => {
    const checkIn1 = buildCheckIn({ id: 'c1', checkedInAt: '2026-08-16T09:00:00.000Z' });
    const checkIn2 = buildCheckIn({ id: 'c2', checkedInAt: '2026-08-16T12:00:00.000Z' });
    mockUseDailyDetail.mockReturnValue({
      state: { status: 'loaded', checkIns: [checkIn1, checkIn2], reflection: null, draft: null, activityWindow: { startHour: 7, endHour: 23 } },
      reload: jest.fn(),
    });
    const view = await render(<DailyDetailScreen localDate="2026-08-16" />);

    // Note: expected times are computed with the same local-timezone formatting the
    // component uses, rather than hardcoded, because this suite's local TZ is not UTC
    // (this machine runs Asia/Seoul) and the brief's hardcoded '09:00'/'12:00' assumed UTC.
    const formatKoreanTime = (iso: string) =>
      new Intl.DateTimeFormat('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso));
    const firstTime = formatKoreanTime(checkIn1.checkedInAt);
    const lastTime = formatKoreanTime(checkIn2.checkedInAt);

    expect(view.getByText(new RegExp(`첫 체크인 ${firstTime} · 마지막 체크인 ${lastTime}`))).toBeTruthy();
  });

  it('syncs selection between a map pin and its timeline slot', async () => {
    const checkIn = buildCheckIn({ id: 'c1', checkedInAt: '2026-08-16T09:00:00.000Z' });
    mockUseDailyDetail.mockReturnValue({
      state: { status: 'loaded', checkIns: [checkIn], reflection: null, draft: null, activityWindow: { startHour: 7, endHour: 23 } },
      reload: jest.fn(),
    });
    const view = await render(<DailyDetailScreen localDate="2026-08-16" />);

    await fireEvent.press(view.getByTestId('daily-detail-pin-c1'));

    await waitFor(() => {
      const timelineSlot = view.getByTestId('daily-detail-timeline-c1');
      const flattenedStyle = [timelineSlot.props.style].flat();
      expect(flattenedStyle).toEqual(expect.arrayContaining([expect.objectContaining({ borderColor: '#2e6af0' })]));
    });
  });
});
