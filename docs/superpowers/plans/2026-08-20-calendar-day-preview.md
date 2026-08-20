# 캘린더 날짜 미리보기 패널 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 캘린더 탭에서 날짜를 탭하면 화면 전환 없이 그리드 아래에 해당 날짜의 체크인 미리보기 패널을 보여주고, 진입 시 오늘이 보이는 달이면 오늘을 기본 선택한다.

**Architecture:** 기존 `CalendarRoute`(`mobile/app/(tabs)/calendar.tsx`) 컴포넌트에 `selectedDate` 상태와 미리보기 조회를 추가한다. 새 저장소 메서드는 필요 없다 — 일별 상세 화면과 동일한 `CheckInRepository.listByLocalDay`를 재사용한다. 부수적으로, 체크인 시각 포맷터(`formatLocalTime`)가 `CheckInListRow.tsx`와 `DailyDetailScreen.tsx`에 중복 정의돼 있는데 이번에 세 번째 사용처가 생기므로 `mobile/src/shared/formatLocalTime.ts`로 추출한다.

**Tech Stack:** React Native(Expo SDK ~57), expo-router, `@testing-library/react-native`, 기존 `CheckInRepository` 인터페이스.

## Global Constraints

- 모바일 명령은 `cd mobile && nvm use 24`로 Node.js 24에서 실행한다.
- 새 저장소 메서드를 추가하지 않는다 — `CheckInRepository.listByLocalDay(localDate, timezone)`만 재사용한다(`docs/superpowers/specs/2026-08-20-calendar-day-preview-design.md` 4절).
- 월 이동(`이전 달`/`다음 달`) 시 선택된 날짜와 미리보기를 항상 초기화한다(설계 문서 2절·5절).
- 미리보기 조회 실패는 그리드·범례·요약 렌더링에 영향을 주지 않는다(설계 문서 6절). 사용자가 직접 탭한 날짜의 조회가 실패하면 패널 안에 오류 텍스트를 보여주고, 진입 시 자동으로 선택된 오늘의 조회가 실패하면 선택 자체를 해제해 기존 화면처럼 보이게 한다(오류를 요청하지 않은 사용자에게 오류를 보여주지 않는다).
- 체크인이 없는 날을 선택해도 `자세히 보기`는 항상 노출한다(설계 문서 3절 — 회고는 체크인 없이도 작성 가능).
- 날짜 셀 탭은 더 이상 즉시 `/day/[date]`로 이동하지 않는다 — 선택 상태만 바꾼다. 이동은 미리보기 패널의 `자세히 보기` 버튼에서만 일어난다.

---

## File Structure

```
mobile/src/shared/formatLocalTime.ts      # 신규 — 체크인 시각 포맷터 (ko-KR, HH:mm, 24시간제)
mobile/src/features/check-in/CheckInListRow.tsx        # 수정 — 로컬 정의 제거, 공용 유틸 사용
mobile/src/features/daily-reflection/DailyDetailScreen.tsx  # 수정 — 로컬 정의 제거, 공용 유틸 사용
mobile/app/(tabs)/calendar.tsx            # 수정 — 날짜 선택 상태·미리보기 패널 추가

mobile/__tests__/formatLocalTime.test.ts  # 신규
mobile/__tests__/CalendarScreen.test.tsx  # 수정 — 기존 네비게이션 테스트 갱신 + 미리보기 테스트 추가
```

`CheckInListRow.test.tsx`, `DailyDetailScreen.test.tsx`는 렌더링 결과(화면에 보이는 텍스트)를 검증하므로 내부 구현을 유틸로 옮겨도 동작이 같다면 수정 없이 통과해야 한다 — Task 1에서 실행해 확인한다.

---

### Task 1: 체크인 시각 포맷터를 공용 유틸로 추출

**Files:**
- Create: `mobile/src/shared/formatLocalTime.ts`
- Test: `mobile/__tests__/formatLocalTime.test.ts`
- Modify: `mobile/src/features/check-in/CheckInListRow.tsx`
- Modify: `mobile/src/features/daily-reflection/DailyDetailScreen.tsx`

**Interfaces:**
- Produces: `formatLocalTime(checkedInAt: string): string` — ISO 문자열을 받아 `HH:mm`(24시간제, `ko-KR`) 문자열을 반환.

- [ ] **Step 1: 실패하는 테스트 작성**

```typescript
// mobile/__tests__/formatLocalTime.test.ts
import { formatLocalTime } from '../src/shared/formatLocalTime';

describe('formatLocalTime', () => {
  it('formats an ISO timestamp as 24-hour HH:mm', () => {
    const iso = new Date(2026, 7, 20, 14, 32).toISOString();
    expect(formatLocalTime(iso)).toBe('14:32');
  });

  it('zero-pads single-digit hours and minutes', () => {
    const iso = new Date(2026, 7, 20, 0, 55).toISOString();
    expect(formatLocalTime(iso)).toBe('00:55');
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd mobile && nvm use 24 && npx jest formatLocalTime -t "formats" 2>&1 | tail -20`
Expected: FAIL — `Cannot find module '../src/shared/formatLocalTime'`

- [ ] **Step 3: 유틸 구현**

```typescript
// mobile/src/shared/formatLocalTime.ts
export function formatLocalTime(checkedInAt: string): string {
  return new Intl.DateTimeFormat('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false }).format(
    new Date(checkedInAt),
  );
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd mobile && nvm use 24 && npx jest formatLocalTime 2>&1 | tail -20`
Expected: PASS (2 tests)

- [ ] **Step 5: 기존 중복 정의를 공용 유틸로 교체**

`mobile/src/features/check-in/CheckInListRow.tsx`에서 로컬 `formatLocalTime` 함수 정의(파일 상단의 `function formatLocalTime(...) { ... }`)를 삭제하고, 대신 import를 추가한다.

```typescript
// mobile/src/features/check-in/CheckInListRow.tsx 상단 import에 추가
import { formatLocalTime } from '../../shared/formatLocalTime';
```

`mobile/src/features/daily-reflection/DailyDetailScreen.tsx`도 동일하게 로컬 `formatLocalTime` 함수 정의를 삭제하고 import로 교체한다. (이 파일에는 `formatDuration`도 있는데, 그건 그대로 둔다 — 이번 추출 대상이 아니다.)

```typescript
// mobile/src/features/daily-reflection/DailyDetailScreen.tsx 상단 import에 추가
import { formatLocalTime } from '../../shared/formatLocalTime';
```

- [ ] **Step 6: 기존 테스트가 여전히 통과하는지 확인**

Run: `cd mobile && nvm use 24 && npx jest CheckInListRow DailyDetailScreen formatLocalTime 2>&1 | tail -40`
Expected: 세 스위트 모두 PASS — 렌더링 결과 텍스트가 이전과 동일해야 한다.

- [ ] **Step 7: 커밋**

```bash
cd mobile && git add src/shared/formatLocalTime.ts src/features/check-in/CheckInListRow.tsx src/features/daily-reflection/DailyDetailScreen.tsx __tests__/formatLocalTime.test.ts
git commit -m "refactor(shared): 체크인 시각 포맷터를 공용 유틸로 추출"
```

---

### Task 2: 날짜 셀 탭 → 선택 상태로 전환 (네비게이션 대체)

**Files:**
- Modify: `mobile/app/(tabs)/calendar.tsx`
- Modify: `mobile/__tests__/CalendarScreen.test.tsx`

**Interfaces:**
- Consumes: 기존 `daysInMonth`, `firstWeekday`, `toLocalDateString`, `localDateAndTimezone()` (변경 없음).
- Produces: `CalendarRoute` 내부 상태 `selectedDate: string | null` — Task 3이 이 상태를 읽어 미리보기를 조회한다.

- [ ] **Step 1: 기존 파일 전체를 읽고 현재 구조를 확인**

Run: `sed -n '1,123p' mobile/app/\(tabs\)/calendar.tsx`

(이미 위 컨텍스트에 전체 내용이 있음 — 확인만 하고 다음 단계로.)

- [ ] **Step 2: 실패하는 테스트로 기존 "즉시 이동" 테스트를 "선택 후 자세히 보기로 이동" 테스트로 교체**

`mobile/__tests__/CalendarScreen.test.tsx`의 최상단 mock 타입 선언과 각 테스트의 `mockRepository` 객체에 `listByLocalDay`를 추가한다(선택 상태가 기본적으로 오늘로 시작되므로, 마운트 시 모든 테스트가 이 메서드를 호출한다). 그리고 두 번째 테스트(`navigates to the day route...`)를 아래 내용으로 통째로 교체한다.

```typescript
// mobile/__tests__/CalendarScreen.test.tsx
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
});
```

- [ ] **Step 3: 테스트 실패 확인**

Run: `cd mobile && nvm use 24 && npx jest CalendarScreen 2>&1 | tail -40`
Expected: FAIL — `자세히 보기` 버튼이 아직 없고, 날짜 탭이 여전히 `router.push`를 호출한다(첫 번째 새 테스트에서 `expect(mockPush).not.toHaveBeenCalled()`가 깨짐).

- [ ] **Step 4: `CalendarRoute`에 선택 상태 추가, 셀 탭 동작을 네비게이션에서 선택으로 변경**

`mobile/app/(tabs)/calendar.tsx`의 `import`와 컴포넌트 본문을 아래처럼 바꾼다. (Task 3에서 미리보기 패널을 추가하므로, 이 단계에서는 상태와 셀 탭 동작만 바꾸고 패널 렌더링은 다음 태스크에서 이어간다 — 단, 위 테스트가 `자세히 보기` 버튼의 존재를 확인하므로 최소한의 패널 골격은 이 단계에서 함께 넣는다.)

```typescript
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useFootLogRepository } from '../../src/database/FootLogContext';
import { localDateAndTimezone } from '../../src/shared/localDate';
import { formatLocalTime } from '../../src/shared/formatLocalTime';
import { colors, fonts } from '../../src/shared/theme';
import type { CheckIn } from '../../src/features/check-in/domain';

const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

function firstWeekday(year: number, month: number): number {
  return new Date(year, month - 1, 1).getDay();
}

function toLocalDateString(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function formatPreviewDate(localDate: string): string {
  const [, month, day] = localDate.split('-').map(Number);
  return `${month}월 ${day}일`;
}

type PreviewState =
  | { status: 'loading' }
  | { status: 'loaded'; checkIns: CheckIn[] }
  | { status: 'error' };

export default function CalendarRoute() {
  const router = useRouter();
  const repository = useFootLogRepository();
  const { localDate: todayLocalDate, timezone } = localDateAndTimezone();
  const [todayYear, todayMonth] = todayLocalDate.split('-').map(Number);
  const [year, setYear] = useState(todayYear);
  const [month, setMonth] = useState(todayMonth);
  const [datesWithCheckIns, setDatesWithCheckIns] = useState<Set<string>>(new Set());
  const initialSelection = year === todayYear && month === todayMonth ? todayLocalDate : null;
  const [selectedDate, setSelectedDate] = useState<string | null>(initialSelection);
  // Tracks whether the current selection came from the silent default-today logic above,
  // as opposed to an explicit cell tap. A failed fetch for a default selection should fall
  // back to "no selection" (design doc §6) rather than show an error the user never asked
  // for; a failed fetch for a selection the user tapped should show the inline error.
  const [isDefaultSelection, setIsDefaultSelection] = useState(initialSelection !== null);
  const [preview, setPreview] = useState<PreviewState>({ status: 'loading' });

  const loadDots = useCallback(() => {
    void repository.listLocalDatesWithCheckIns(year, month, timezone)
      .then((dates) => setDatesWithCheckIns(new Set(dates)))
      .catch(() => setDatesWithCheckIns(new Set()));
  }, [repository, year, month, timezone]);

  useEffect(() => { loadDots(); }, [loadDots]);

  useEffect(() => {
    if (!selectedDate) return undefined;
    let isCurrent = true;
    setPreview({ status: 'loading' });
    void repository.listByLocalDay(selectedDate, timezone)
      .then((checkIns) => { if (isCurrent) setPreview({ status: 'loaded', checkIns }); })
      .catch(() => {
        if (!isCurrent) return;
        if (isDefaultSelection) {
          setSelectedDate(null);
        } else {
          setPreview({ status: 'error' });
        }
      });
    return () => { isCurrent = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- isDefaultSelection is read, not a trigger: re-running this effect when it flips would refetch a date whose fetch is already in flight.
  }, [selectedDate, repository, timezone]);

  const selectDate = (date: string) => {
    setIsDefaultSelection(false);
    setSelectedDate(date);
  };

  const goToPreviousMonth = () => {
    setSelectedDate(null);
    if (month === 1) { setYear((value) => value - 1); setMonth(12); } else { setMonth((value) => value - 1); }
  };

  const goToNextMonth = () => {
    setSelectedDate(null);
    if (month === 12) { setYear((value) => value + 1); setMonth(1); } else { setMonth((value) => value + 1); }
  };

  const totalDays = daysInMonth(year, month);
  const leadingBlanks = firstWeekday(year, month);
  const cells: (number | null)[] = [
    ...Array.from({ length: leadingBlanks }, () => null),
    ...Array.from({ length: totalDays }, (_, index) => index + 1),
  ];

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="이전 달" onPress={goToPreviousMonth}>
          <Text style={styles.navText}>‹</Text>
        </Pressable>
        <Text style={styles.title}>{year}년 {month}월</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="다음 달" onPress={goToNextMonth}>
          <Text style={styles.navText}>›</Text>
        </Pressable>
      </View>

      <View style={styles.weekdayRow}>
        {WEEKDAY_LABELS.map((label) => (
          <Text key={label} style={styles.weekdayLabel}>{label}</Text>
        ))}
      </View>

      <View style={styles.grid}>
        {cells.map((day, index) => {
          if (day === null) {
            return <View key={`blank-${index}`} style={styles.cell} />;
          }
          const localDate = toLocalDateString(year, month, day);
          const hasCheckIns = datesWithCheckIns.has(localDate);
          const isSelected = localDate === selectedDate;
          return (
            <Pressable
              key={localDate}
              accessibilityRole="button"
              accessibilityLabel={`${year}년 ${month}월 ${day}일`}
              accessibilityState={{ selected: isSelected }}
              onPress={() => selectDate(localDate)}
              style={[styles.cell, isSelected && styles.cellSelected]}
            >
              <Text style={[styles.dayText, isSelected && styles.dayTextSelected]}>{day}</Text>
              {hasCheckIns && (
                <View
                  testID={`calendar-dot-${localDate}`}
                  style={[styles.dot, isSelected && styles.dotSelected]}
                />
              )}
            </Pressable>
          );
        })}
      </View>

      <View style={styles.summary}>
        <View style={styles.legendRow}>
          <View style={styles.dot} />
          <Text style={styles.legendText}>체크인 기록이 있는 날</Text>
        </View>
        <Text style={styles.summaryText}>이번 달 체크인 {datesWithCheckIns.size}일</Text>
      </View>

      {selectedDate && (
        <View style={styles.preview}>
          <Text style={styles.previewDate}>{formatPreviewDate(selectedDate)}</Text>
          {preview.status === 'loading' && <ActivityIndicator color={colors.primary} />}
          {preview.status === 'error' && <Text style={styles.previewError}>불러오지 못했어요.</Text>}
          {preview.status === 'loaded' && (
            <Text style={styles.previewSummary}>
              {preview.checkIns.length === 0
                ? '이날은 남겨진 발자국이 없어요.'
                : `체크인 ${preview.checkIns.length}개 · ${[...preview.checkIns]
                    .sort((a, b) => Date.parse(a.checkedInAt) - Date.parse(b.checkedInAt))
                    .map((checkIn) => formatLocalTime(checkIn.checkedInAt))
                    .join(', ')}`}
            </Text>
          )}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="자세히 보기"
            onPress={() => router.push({ pathname: '/day/[date]', params: { date: selectedDate } })}
            style={styles.previewLink}
          >
            <Text style={styles.previewLinkText}>자세히 보기 →</Text>
          </Pressable>
        </View>
      )}
    </SafeAreaView>
  );
}
```

`styles`에 아래 항목을 추가한다(기존 `header`~`summaryText`는 그대로 둔다).

```typescript
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: 16, gap: 16 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  navText: { fontSize: 24, color: colors.primary, paddingHorizontal: 12 },
  title: { fontSize: 26, fontFamily: fonts.display, color: colors.textPrimary },
  weekdayRow: { flexDirection: 'row' },
  weekdayLabel: { flex: 1, textAlign: 'center', fontSize: 13, color: colors.textMuted },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: `${100 / 7}%`, aspectRatio: 1, alignItems: 'center', justifyContent: 'center', gap: 4, borderRadius: 12 },
  cellSelected: { backgroundColor: colors.primary },
  dayText: { fontSize: 15, color: colors.textPrimary },
  dayTextSelected: { color: colors.onPrimary, fontWeight: '700' },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.primary },
  dotSelected: { backgroundColor: colors.onPrimary },
  summary: { paddingTop: 8, gap: 8, borderTopWidth: 1, borderTopColor: colors.border },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendText: { fontSize: 13, color: colors.textMuted },
  summaryText: { fontSize: 14, fontWeight: '600', color: colors.textSecondary },
  preview: { padding: 16, borderRadius: 14, backgroundColor: colors.primarySoftBackground, gap: 8 },
  previewDate: { fontSize: 17, fontFamily: fonts.display, color: colors.textPrimary },
  previewSummary: { fontSize: 13, color: colors.primarySoftText },
  previewError: { fontSize: 13, color: colors.error },
  previewLink: { alignSelf: 'flex-start' },
  previewLinkText: { fontSize: 13, fontWeight: '600', color: colors.primarySoftText },
});
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `cd mobile && nvm use 24 && npx jest CalendarScreen 2>&1 | tail -50`
Expected: PASS (5 tests)

- [ ] **Step 6: 커밋**

```bash
cd mobile && git add app/\(tabs\)/calendar.tsx __tests__/CalendarScreen.test.tsx
git commit -m "feat(calendar): 날짜 탭으로 미리보기 패널을 열고 자세히 보기로 이동"
```

---

### Task 3: 미리보기 패널 세부 상태 — 빈 상태·오류·타임존 검증

Task 2에서 이미 패널의 기본 골격(로딩/로드됨/오류, 자세히 보기)이 들어갔다. 이 태스크는 명세 8절이 요구하는 나머지 케이스 — 오늘 기본 선택, 체크인 있는 날의 정확한 요약 문구, 조회 실패가 그리드에 영향을 주지 않는지 — 를 테스트로 못박는다.

**Files:**
- Modify: `mobile/__tests__/CalendarScreen.test.tsx`

**Interfaces:**
- Consumes: Task 2에서 만든 `selectedDate`, `preview` 상태와 렌더링 결과(변경 없음, 테스트만 추가).

- [ ] **Step 1: 실패하는 테스트 4건 추가**

`mobile/__tests__/CalendarScreen.test.tsx`의 `describe('CalendarRoute', ...)` 블록 안, 마지막 `it(...)` 뒤에 추가한다.

```typescript
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
```

- [ ] **Step 2: 테스트 실행**

Run: `cd mobile && nvm use 24 && npx jest CalendarScreen 2>&1 | tail -60`
Expected: PASS (9 tests) — Task 2에서 이미 구현이 들어갔으므로 이 단계는 회귀 없이 바로 통과해야 한다. 만약 실패한다면 Task 2 Step 4의 구현을 다시 확인한다(특히 `preview.status === 'loaded'`일 때 개수·문구, `isDefaultSelection`에 따라 오류 시 폴백/인라인 오류를 다르게 처리하는지).

- [ ] **Step 3: 커밋**

```bash
cd mobile && git add __tests__/CalendarScreen.test.tsx
git commit -m "test(calendar): 미리보기 패널 기본 선택·빈 상태·오류 케이스 검증"
```

---

## Post-Implementation Checklist

- [ ] `cd mobile && nvm use 24 && npm test` 전체 스위트 통과
- [ ] `cd mobile && nvm use 24 && npm run typecheck` 통과
- [ ] `cd mobile && nvm use 24 && npm run lint` 통과
- [ ] `cd mobile && nvm use 24 && npx expo-doctor` 통과
- [ ] iOS 시뮬레이터에서 캘린더 탭 진입 → 오늘 기본 선택 확인 → 다른 날짜 탭 → 미리보기 패널 확인 → 자세히 보기 → 일별 상세 이동 확인 → 이전 달 이동 시 선택 해제 확인
