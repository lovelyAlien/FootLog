process.env.TZ = 'Asia/Seoul';

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
const mockReflectionRepository = { getByLocalDate: jest.fn(), save: jest.fn() };
const mockDraftRepository = { getDraft: jest.fn(), saveDraft: jest.fn(), clearDraft: jest.fn() };

jest.mock('../src/features/daily-reflection/DailyReflectionContext', () => ({
  useDailyReflectionDependencies: () => ({
    reflectionRepository: mockReflectionRepository,
    draftRepository: mockDraftRepository,
    uuid: () => 'new-reflection-id',
    now: () => '2026-08-16T20:00:00.000Z',
  }),
}));

import { act, fireEvent, render, waitFor, within } from '@testing-library/react-native';

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
    expect(view.queryByTestId('daily-detail-map')).toBeNull();
  });

  it('shows daily summary facts for a day with check-ins', async () => {
    const checkIn1 = buildCheckIn({ id: 'c1', checkedInAt: '2026-08-16T09:00:00.000Z' });
    const checkIn2 = buildCheckIn({ id: 'c2', checkedInAt: '2026-08-16T12:00:00.000Z' });
    mockUseDailyDetail.mockReturnValue({
      state: { status: 'loaded', checkIns: [checkIn1, checkIn2], reflection: null, draft: null, activityWindow: { startHour: 7, endHour: 23 } },
      reload: jest.fn(),
    });
    const view = await render(<DailyDetailScreen localDate="2026-08-16" />);

    // TZ is pinned to Asia/Seoul (UTC+9) at the top of this file, so these UTC
    // timestamps map to fixed, known-correct local wall-clock times:
    // 2026-08-16T09:00:00.000Z -> 18:00, 2026-08-16T12:00:00.000Z -> 21:00.
    expect(view.getByText(/첫 체크인 18:00 · 마지막 체크인 21:00/)).toBeTruthy();
    expect(
      view.getByText('선은 실제 이동 경로가 아니라 기록 지점을 시간순으로 연결한 선이에요.'),
    ).toBeTruthy();
  });

  it('wraps the loaded content in a ScrollView so the reflection editor and 완료 button stay reachable', async () => {
    const checkIn = buildCheckIn({ id: 'c1', checkedInAt: '2026-08-16T09:00:00.000Z' });
    mockUseDailyDetail.mockReturnValue({
      state: { status: 'loaded', checkIns: [checkIn], reflection: null, draft: null, activityWindow: { startHour: 7, endHour: 23 } },
      reload: jest.fn(),
    });
    const view = await render(<DailyDetailScreen localDate="2026-08-16" />);

    const scrollView = view.getByTestId('daily-detail-scroll');
    // 'RCTScrollView' is the native host component name that ScrollView (and
    // only ScrollView, not a plain View) renders to — this proves the node is
    // an actual scrollable container, not just any tagged view.
    expect(scrollView.type).toBe('RCTScrollView');
    // The reflection input and the 완료 button must live inside the scrollable
    // container, not below a fixed viewport where they'd be unreachable.
    expect(within(scrollView).getByTestId('daily-detail-reflection-input')).toBeTruthy();
    expect(within(scrollView).getByRole('button', { name: '완료' })).toBeTruthy();
  });

  it('keeps a check-in outside the activity window reachable on the timeline and synced to its pin', async () => {
    // With TZ pinned to Asia/Seoul (UTC+9), 2026-08-15T17:00:00.000Z is local
    // 2026-08-16T02:00, which falls outside the activityWindow [7, 23] below.
    const outsideCheckIn = buildCheckIn({ id: 'c-outside', checkedInAt: '2026-08-15T17:00:00.000Z' });
    mockUseDailyDetail.mockReturnValue({
      state: { status: 'loaded', checkIns: [outsideCheckIn], reflection: null, draft: null, activityWindow: { startHour: 7, endHour: 23 } },
      reload: jest.fn(),
    });
    const view = await render(<DailyDetailScreen localDate="2026-08-16" />);

    // The check-in must have a real (non-empty) timeline slot despite being
    // outside the configured activity window.
    expect(view.getByTestId('daily-detail-timeline-c-outside')).toBeTruthy();
    expect(view.queryByTestId('daily-detail-timeline-empty-2')).toBeNull();

    await fireEvent.press(view.getByTestId('daily-detail-pin-c-outside'));

    await waitFor(() => {
      const timelineSlot = view.getByTestId('daily-detail-timeline-c-outside');
      const flattenedStyle = [timelineSlot.props.style].flat();
      expect(flattenedStyle).toEqual(expect.arrayContaining([expect.objectContaining({ borderColor: '#2e6af0' })]));
    });
  });

  it('syncs selection between a map pin and its timeline slot', async () => {
    // With TZ pinned to Asia/Seoul, this UTC timestamp buckets to local hour 18,
    // which falls inside the activityWindow [7, 23] below.
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

  it('auto-saves the draft while typing before completion, debounced', async () => {
    jest.useFakeTimers();
    mockReflectionRepository.getByLocalDate.mockResolvedValue(null);
    mockDraftRepository.saveDraft.mockResolvedValue(undefined);
    mockUseDailyDetail.mockReturnValue({
      state: { status: 'loaded', checkIns: [], reflection: null, draft: null, activityWindow: { startHour: 7, endHour: 23 } },
      reload: jest.fn(),
    });

    const view = await render(<DailyDetailScreen localDate="2026-08-16" />);
    await fireEvent.changeText(view.getByTestId('daily-detail-reflection-input'), '오늘은');

    await act(() => { jest.advanceTimersByTime(499); });
    expect(mockDraftRepository.saveDraft).not.toHaveBeenCalled();

    await act(() => { jest.advanceTimersByTime(1); });
    await waitFor(() => expect(mockDraftRepository.saveDraft).toHaveBeenCalledWith('2026-08-16', '오늘은'));

    jest.useRealTimers();
  });

  it('cancels a pending draft auto-save when 완료 is pressed before the debounce fires', async () => {
    jest.useFakeTimers();
    mockDraftRepository.saveDraft.mockClear();
    mockDraftRepository.saveDraft.mockResolvedValue(undefined);
    mockDraftRepository.clearDraft.mockResolvedValue(undefined);
    mockReflectionRepository.getByLocalDate.mockResolvedValue(null);
    mockReflectionRepository.save.mockResolvedValue(undefined);
    mockUseDailyDetail.mockReturnValue({
      state: { status: 'loaded', checkIns: [], reflection: null, draft: null, activityWindow: { startHour: 7, endHour: 23 } },
      reload: jest.fn(),
    });

    const view = await render(<DailyDetailScreen localDate="2026-08-16" />);
    await fireEvent.changeText(view.getByTestId('daily-detail-reflection-input'), '완료 직전 입력');

    await act(async () => { await fireEvent.press(view.getByRole('button', { name: '완료' })); });

    await waitFor(() => expect(mockReflectionRepository.save).toHaveBeenCalledWith({
      id: 'new-reflection-id',
      localDate: '2026-08-16',
      body: '완료 직전 입력',
      updatedAt: '2026-08-16T20:00:00.000Z',
    }));
    expect(mockDraftRepository.clearDraft).toHaveBeenCalledWith('2026-08-16');

    await act(() => { jest.advanceTimersByTime(500); });
    expect(mockDraftRepository.saveDraft).not.toHaveBeenCalled();

    jest.useRealTimers();
  });

  it('completes a reflection, clears the draft, and hides the 완료 button afterward', async () => {
    mockReflectionRepository.save.mockResolvedValue(undefined);
    mockReflectionRepository.getByLocalDate.mockResolvedValue(null);
    mockDraftRepository.clearDraft.mockResolvedValue(undefined);
    mockUseDailyDetail.mockReturnValue({
      state: { status: 'loaded', checkIns: [], reflection: null, draft: '오늘의 초안', activityWindow: { startHour: 7, endHour: 23 } },
      reload: jest.fn(),
    });

    const view = await render(<DailyDetailScreen localDate="2026-08-16" />);
    expect(view.getByTestId('daily-detail-reflection-input').props.value).toBe('오늘의 초안');

    await fireEvent.press(view.getByRole('button', { name: '완료' }));

    await waitFor(() => expect(mockReflectionRepository.save).toHaveBeenCalledWith({
      id: 'new-reflection-id',
      localDate: '2026-08-16',
      body: '오늘의 초안',
      updatedAt: '2026-08-16T20:00:00.000Z',
    }));
    expect(mockDraftRepository.clearDraft).toHaveBeenCalledWith('2026-08-16');
    await waitFor(() => expect(view.queryByRole('button', { name: '완료' })).toBeNull());
  });

  it('keeps the entered body, shows an error message, and preserves the text as a draft when completion fails', async () => {
    mockReflectionRepository.getByLocalDate.mockResolvedValue(null);
    mockReflectionRepository.save.mockRejectedValue(new Error('disk full'));
    mockDraftRepository.saveDraft.mockClear();
    mockDraftRepository.saveDraft.mockResolvedValue(undefined);
    mockUseDailyDetail.mockReturnValue({
      state: { status: 'loaded', checkIns: [], reflection: null, draft: null, activityWindow: { startHour: 7, endHour: 23 } },
      reload: jest.fn(),
    });

    const view = await render(<DailyDetailScreen localDate="2026-08-16" />);
    await fireEvent.changeText(view.getByTestId('daily-detail-reflection-input'), '실패할 회고');
    await fireEvent.press(view.getByRole('button', { name: '완료' }));

    await waitFor(() => expect(view.getByText('회고를 저장하지 못했어요. 다시 시도해 주세요.')).toBeTruthy());
    expect(view.getByTestId('daily-detail-reflection-input').props.value).toBe('실패할 회고');
    // The failed completion must not silently lose the typed text: it should
    // be written to the draft store so it survives navigating away.
    await waitFor(() => expect(mockDraftRepository.saveDraft).toHaveBeenCalledWith('2026-08-16', '실패할 회고'));
  });

  it('prefills from a completed reflection rather than the draft, and has no 완료 button', async () => {
    mockUseDailyDetail.mockReturnValue({
      state: {
        status: 'loaded',
        checkIns: [],
        reflection: { id: 'existing-id', localDate: '2026-08-16', body: '완료된 회고', updatedAt: '2026-08-16T10:00:00.000Z' },
        draft: '무시되어야 할 초안',
        activityWindow: { startHour: 7, endHour: 23 },
      },
      reload: jest.fn(),
    });

    const view = await render(<DailyDetailScreen localDate="2026-08-16" />);

    expect(view.getByTestId('daily-detail-reflection-input').props.value).toBe('완료된 회고');
    expect(view.queryByRole('button', { name: '완료' })).toBeNull();
  });
});
