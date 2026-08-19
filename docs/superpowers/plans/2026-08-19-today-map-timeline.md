# 오늘 탭 지도+타임라인 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 오늘 탭(`(tabs)/index.tsx`)을 텍스트 리스트에서 지도 핀 + 드래그 가능한 바텀시트 타임라인으로 교체해 PRD FR-M1-04(지도 핀과 시간순 타임라인, 선택 상태 연동)를 충족시킨다.

**Architecture:** 캘린더 상세 화면(`DailyDetailScreen.tsx`)에 있던 지도 마커 렌더링을 `CheckInMapPins`로 추출해 두 화면이 공유하고, 오늘 탭 전용으로 `TodayMapSheet`(지도+FAB+`@gorhom/bottom-sheet`)와 `CheckInListRow`를 새로 만든다. 위치 폴백 로직은 `resolveInitialMapRegion` 순수 함수로 분리해 단위 테스트한다. 캘린더 탭의 스크롤+회고 구조는 건드리지 않는다.

**Tech Stack:** React Native (Expo SDK 57), `react-native-maps`, `@gorhom/bottom-sheet`(신규), `react-native-gesture-handler`/`react-native-reanimated`(기존, 이번에 처음 실사용), `expo-location`, Jest + `@testing-library/react-native`.

## Global Constraints

- 위치 권한은 "사용 중"만 사용한다 — 백그라운드 상시 추적을 추가하지 않는다.
- 캘린더 탭(`DailyDetailScreen.tsx`)의 스크롤 레이아웃과 회고 입력 UI는 변경하지 않는다 — 지도 마커 렌더링만 공용 컴포넌트로 교체한다.
- 신규 네이티브 의존성은 `@gorhom/bottom-sheet@5.2.14` 하나만 추가한다. 설치 후 반드시 `npx expo run:ios --no-bundler`로 시뮬레이터 빌드까지 확인한다(Task 7).
- 위치 폴백 기본 좌표는 서울시청(`latitude: 37.5665, longitude: 126.978`)이다.
- 자동 검사 순서: `npm test` → `npm run typecheck` → `npm run lint` → `npx expo-doctor` (모바일 명령은 `nvm use 24` 이후 `cd mobile`에서 실행).
- 모든 신규 사용자 노출 문자열은 한글로 작성한다.

---

### Task 1: `CheckInMapPins` 공용 컴포넌트 추출

**Files:**
- Create: `mobile/src/features/check-in/CheckInMapPins.tsx`
- Modify: `mobile/src/features/daily-reflection/DailyDetailScreen.tsx:1-4,142-162`
- Test: `mobile/__tests__/CheckInMapPins.test.tsx`

**Interfaces:**
- Produces: `CheckInMapPins({ checkIns, selectedCheckInId, onSelectCheckIn, testIDPrefix }: { checkIns: CheckIn[]; selectedCheckInId: string | null; onSelectCheckIn: (id: string) => void; testIDPrefix: string })` — `checkIns`는 호출자가 시간순으로 정렬해서 넘겨야 한다. `react-native-maps`의 `MapView` 자식으로만 렌더링 가능하다(직접 `<MapView>`로 감싸지 않으면 지도에 표시되지 않는다).

- [ ] **Step 1: 실패하는 테스트 작성**

`mobile/__tests__/CheckInMapPins.test.tsx`:

```tsx
jest.mock('react-native-maps', () => {
  const React = require('react');
  const { Pressable, View } = require('react-native');

  return {
    __esModule: true,
    default: ({ children, ...props }: { children?: React.ReactNode }) => (
      <View testID="mock-map" {...props}>{children}</View>
    ),
    Marker: ({ onPress, testID, ...props }: { onPress?: () => void; testID?: string }) => (
      <Pressable testID={testID} onPress={onPress} {...props} />
    ),
    Polyline: (props: object) => <View testID="mock-polyline" {...props} />,
  };
});

import { fireEvent, render } from '@testing-library/react-native';
import MapView from 'react-native-maps';

import { CheckInMapPins } from '../src/features/check-in/CheckInMapPins';
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

describe('CheckInMapPins', () => {
  it('renders one pin per check-in with the given testID prefix', async () => {
    const checkIn1 = buildCheckIn({ id: 'c1', checkedInAt: '2026-08-16T09:00:00.000Z' });
    const checkIn2 = buildCheckIn({ id: 'c2', checkedInAt: '2026-08-16T10:00:00.000Z' });
    const view = await render(
      <MapView>
        <CheckInMapPins
          checkIns={[checkIn1, checkIn2]}
          selectedCheckInId={null}
          onSelectCheckIn={jest.fn()}
          testIDPrefix="today-map"
        />
      </MapView>,
    );

    expect(view.getByTestId('today-map-pin-c1')).toBeTruthy();
    expect(view.getByTestId('today-map-pin-c2')).toBeTruthy();
  });

  it('colors only the selected pin with the primary color', async () => {
    const checkIn1 = buildCheckIn({ id: 'c1', checkedInAt: '2026-08-16T09:00:00.000Z' });
    const checkIn2 = buildCheckIn({ id: 'c2', checkedInAt: '2026-08-16T10:00:00.000Z' });
    const view = await render(
      <MapView>
        <CheckInMapPins
          checkIns={[checkIn1, checkIn2]}
          selectedCheckInId="c2"
          onSelectCheckIn={jest.fn()}
          testIDPrefix="today-map"
        />
      </MapView>,
    );

    expect(view.getByTestId('today-map-pin-c1').props.pinColor).toBeUndefined();
    expect(view.getByTestId('today-map-pin-c2').props.pinColor).toBe('#2e6af0');
  });

  it('calls onSelectCheckIn with the tapped check-in id', async () => {
    const checkIn1 = buildCheckIn({ id: 'c1', checkedInAt: '2026-08-16T09:00:00.000Z' });
    const onSelectCheckIn = jest.fn();
    const view = await render(
      <MapView>
        <CheckInMapPins
          checkIns={[checkIn1]}
          selectedCheckInId={null}
          onSelectCheckIn={onSelectCheckIn}
          testIDPrefix="today-map"
        />
      </MapView>,
    );

    await fireEvent.press(view.getByTestId('today-map-pin-c1'));
    expect(onSelectCheckIn).toHaveBeenCalledWith('c1');
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd mobile && npm test -- --runTestsByPath __tests__/CheckInMapPins.test.tsx`
Expected: FAIL — `Cannot find module '../src/features/check-in/CheckInMapPins'`

- [ ] **Step 3: 최소 구현 작성**

`mobile/src/features/check-in/CheckInMapPins.tsx`:

```tsx
import { Marker, Polyline } from 'react-native-maps';

import { colors } from '../../shared/theme';
import type { CheckIn } from './domain';

type CheckInMapPinsProps = {
  checkIns: CheckIn[];
  selectedCheckInId: string | null;
  onSelectCheckIn: (id: string) => void;
  testIDPrefix: string;
};

export function CheckInMapPins({ checkIns, selectedCheckInId, onSelectCheckIn, testIDPrefix }: CheckInMapPinsProps) {
  return (
    <>
      {checkIns.map((checkIn) => (
        <Marker
          key={checkIn.id}
          testID={`${testIDPrefix}-pin-${checkIn.id}`}
          coordinate={{ latitude: checkIn.latitude, longitude: checkIn.longitude }}
          pinColor={checkIn.id === selectedCheckInId ? colors.primary : undefined}
          onPress={() => onSelectCheckIn(checkIn.id)}
        />
      ))}
      <Polyline coordinates={checkIns.map((checkIn) => ({ latitude: checkIn.latitude, longitude: checkIn.longitude }))} />
    </>
  );
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd mobile && npm test -- --runTestsByPath __tests__/CheckInMapPins.test.tsx`
Expected: PASS

- [ ] **Step 5: `DailyDetailScreen.tsx`가 공용 컴포넌트를 쓰도록 교체**

`mobile/src/features/daily-reflection/DailyDetailScreen.tsx`의 import 블록(1-11행)에서 `Marker, Polyline` 임포트를 제거하고 `CheckInMapPins`를 추가한다:

```tsx
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MapView from 'react-native-maps';

import { colors } from '../../shared/theme';
import { CheckInMapPins } from '../check-in/CheckInMapPins';
import type { CheckIn } from '../check-in/domain';
import { computeDailySummary } from './dailySummary';
import { useDailyDetail } from './useDailyDetail';
import { useDailyReflectionDependencies } from './DailyReflectionContext';
import { saveDailyReflection } from './saveDailyReflection';
```

142-162행의 인라인 `Marker`/`Polyline` 블록을 교체한다:

```tsx
            <MapView
              style={styles.map}
              initialRegion={{
                latitude: sortedCheckIns[0].latitude,
                longitude: sortedCheckIns[0].longitude,
                latitudeDelta: 0.02,
                longitudeDelta: 0.02,
              }}
            >
              <CheckInMapPins
                checkIns={sortedCheckIns}
                selectedCheckInId={selectedCheckInId}
                onSelectCheckIn={setSelectedCheckInId}
                testIDPrefix="daily-detail"
              />
            </MapView>
```

- [ ] **Step 6: 기존 캘린더 상세 화면 테스트가 그대로 통과하는지 확인 (회귀 검증)**

Run: `cd mobile && npm test -- --runTestsByPath __tests__/DailyDetailScreen.test.tsx`
Expected: PASS — testID(`daily-detail-pin-*`)와 동작이 변경 전과 동일해야 한다.

- [ ] **Step 7: 커밋**

```bash
cd mobile
git add src/features/check-in/CheckInMapPins.tsx src/features/daily-reflection/DailyDetailScreen.tsx __tests__/CheckInMapPins.test.tsx
git commit -m "refactor(check-in): 지도 마커 렌더링을 CheckInMapPins로 추출"
```

---

### Task 2: `resolveInitialMapRegion` 순수 함수

**Files:**
- Create: `mobile/src/features/check-in/resolveInitialMapRegion.ts`
- Test: `mobile/__tests__/resolveInitialMapRegion.test.ts`

**Interfaces:**
- Consumes: `CheckIn`, `LocationFix`(`mobile/src/features/check-in/domain.ts`)
- Produces: `MapRegion = { latitude: number; longitude: number; latitudeDelta: number; longitudeDelta: number }`, `resolveInitialMapRegion(locationFix: LocationFix | null, checkIns: CheckIn[]): MapRegion` — Task 6(라우트)과 Task 5(TodayMapSheet 타입)가 이 시그니처를 그대로 쓴다.

- [ ] **Step 1: 실패하는 테스트 작성**

`mobile/__tests__/resolveInitialMapRegion.test.ts`:

```ts
import { resolveInitialMapRegion } from '../src/features/check-in/resolveInitialMapRegion';
import type { CheckIn, LocationFix } from '../src/features/check-in/domain';

function buildCheckIn(overrides: Partial<CheckIn> & Pick<CheckIn, 'id' | 'checkedInAt'>): CheckIn {
  return {
    latitude: 37.4,
    longitude: 127.1,
    accuracyM: 10,
    capturedAt: overrides.checkedInAt,
    createdAt: overrides.checkedInAt,
    syncStatus: 'pending',
    ...overrides,
  };
}

describe('resolveInitialMapRegion', () => {
  it('centers on the current location fix when available', () => {
    const locationFix: LocationFix = {
      latitude: 37.55, longitude: 127.05, accuracyM: 8, capturedAt: '2026-08-19T00:00:00.000Z',
    };

    expect(resolveInitialMapRegion(locationFix, [])).toEqual({
      latitude: 37.55, longitude: 127.05, latitudeDelta: 0.02, longitudeDelta: 0.02,
    });
  });

  it('falls back to the most recent check-in when there is no location fix', () => {
    const older = buildCheckIn({ id: 'older', checkedInAt: '2026-08-19T01:00:00.000Z' });
    const newer = buildCheckIn({ id: 'newer', checkedInAt: '2026-08-19T05:00:00.000Z', latitude: 37.6, longitude: 127.2 });

    expect(resolveInitialMapRegion(null, [older, newer])).toEqual({
      latitude: 37.6, longitude: 127.2, latitudeDelta: 0.02, longitudeDelta: 0.02,
    });
  });

  it('falls back to the Seoul City Hall default when there is no fix and no check-ins', () => {
    expect(resolveInitialMapRegion(null, [])).toEqual({
      latitude: 37.5665, longitude: 126.978, latitudeDelta: 0.02, longitudeDelta: 0.02,
    });
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd mobile && npm test -- --runTestsByPath __tests__/resolveInitialMapRegion.test.ts`
Expected: FAIL — `Cannot find module '../src/features/check-in/resolveInitialMapRegion'`

- [ ] **Step 3: 최소 구현 작성**

`mobile/src/features/check-in/resolveInitialMapRegion.ts`:

```ts
import type { CheckIn, LocationFix } from './domain';

export type MapRegion = {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
};

const REGION_DELTA = 0.02;

const SEOUL_CITY_HALL_DEFAULT: MapRegion = {
  latitude: 37.5665,
  longitude: 126.978,
  latitudeDelta: REGION_DELTA,
  longitudeDelta: REGION_DELTA,
};

export function resolveInitialMapRegion(locationFix: LocationFix | null, checkIns: CheckIn[]): MapRegion {
  if (locationFix) {
    return {
      latitude: locationFix.latitude,
      longitude: locationFix.longitude,
      latitudeDelta: REGION_DELTA,
      longitudeDelta: REGION_DELTA,
    };
  }

  if (checkIns.length > 0) {
    const mostRecent = [...checkIns].sort(
      (left, right) => Date.parse(right.checkedInAt) - Date.parse(left.checkedInAt),
    )[0];
    return {
      latitude: mostRecent.latitude,
      longitude: mostRecent.longitude,
      latitudeDelta: REGION_DELTA,
      longitudeDelta: REGION_DELTA,
    };
  }

  return SEOUL_CITY_HALL_DEFAULT;
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd mobile && npm test -- --runTestsByPath __tests__/resolveInitialMapRegion.test.ts`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
cd mobile
git add src/features/check-in/resolveInitialMapRegion.ts __tests__/resolveInitialMapRegion.test.ts
git commit -m "feat(check-in): 오늘 탭 초기 지도 region 폴백 로직 추가"
```

---

### Task 3: `@gorhom/bottom-sheet` 의존성 추가 + `GestureHandlerRootView` 적용

**Files:**
- Modify: `mobile/package.json`, `mobile/package-lock.json`
- Modify: `mobile/app/_layout.tsx:115-153` (반환부), `mobile/app/_layout.tsx:164` (styles 시작부에 `root` 추가), import 블록(파일 상단)

**Interfaces:**
- Produces: 앱 루트가 `GestureHandlerRootView`로 감싸져 있어, Task 5의 `TodayMapSheet`가 `@gorhom/bottom-sheet`의 드래그 제스처를 실제 기기/시뮬레이터에서 쓸 수 있다.

- [ ] **Step 1: 의존성 설치**

Run: `cd mobile && npm install @gorhom/bottom-sheet@5.2.14`
Expected: `package.json`의 `dependencies`에 `"@gorhom/bottom-sheet": "5.2.14"`가 추가된다.

- [ ] **Step 2: `RootLayout`을 `GestureHandlerRootView`로 감싸기**

`mobile/app/_layout.tsx`에서 `react-native-gesture-handler` 임포트를 추가한다(다른 임포트들 아래, `colors` 임포트 다음 줄):

```tsx
import { GestureHandlerRootView } from 'react-native-gesture-handler';
```

`RootLayout` 함수의 반환부(파일 하단, `if (state.status === 'loading')`부터 함수 끝까지)를 아래로 교체한다 — 세 가지 상태(`loading`/`error`/`ready`)를 모두 하나의 `content` 변수로 모으고, 그 결과를 `GestureHandlerRootView`로 감싼다:

```tsx
  let content: React.ReactNode;

  if (state.status === 'loading') {
    content = <LoadingState />;
  } else if (state.status === 'error') {
    content = (
      <View style={styles.centered}>
        <Text style={styles.title}>FootLog을 준비하지 못했어요.</Text>
        <Text style={styles.body}>로컬 저장소를 다시 열어 볼게요.</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="다시 시도"
          onPress={() => {
            setState({ status: 'loading' });
            setAttempt((value) => value + 1);
          }}
          style={styles.retryButton}
        >
          <Text style={styles.retryButtonText}>다시 시도</Text>
        </Pressable>
      </View>
    );
  } else {
    content = (
      <FootLogRepositoryProvider value={state.repository}>
        <NotificationSettingsProvider value={state.notificationSettings}>
          <DailyReflectionProvider value={state.dailyReflection}>
            <Stack>
              <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
              <Stack.Screen name="check-in" options={{ title: '' }} />
              <Stack.Screen name="day/[date]" options={{ title: '일일 회고' }} />
              <Stack.Screen name="settings/reminders" options={{ title: '체크인 알림' }} />
            </Stack>
          </DailyReflectionProvider>
        </NotificationSettingsProvider>
      </FootLogRepositoryProvider>
    );
  }

  return (
    <GestureHandlerRootView style={styles.root}>
      {content}
    </GestureHandlerRootView>
  );
}
```

`styles` 객체(파일 최하단)에 `root`를 추가한다:

```tsx
const styles = StyleSheet.create({
  root: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12, backgroundColor: colors.background },
  title: { fontSize: 22, fontWeight: '700', color: colors.textPrimary, textAlign: 'center' },
  body: { fontSize: 16, color: colors.textSecondary, textAlign: 'center' },
  retryButton: { marginTop: 12, borderRadius: 12, backgroundColor: colors.primary, paddingHorizontal: 20, paddingVertical: 14 },
  retryButtonText: { color: colors.onPrimary, fontSize: 16, fontWeight: '700' },
});
```

- [ ] **Step 3: 기존 루트 레이아웃 테스트가 그대로 통과하는지 확인 (회귀 검증)**

Run: `cd mobile && npm test -- --runTestsByPath __tests__/RootLayout.test.tsx`
Expected: PASS

- [ ] **Step 4: 전체 테스트 스위트로 회귀 확인**

Run: `cd mobile && npm test`
Expected: PASS (모든 기존 테스트 통과)

- [ ] **Step 5: 커밋**

```bash
cd mobile
git add package.json package-lock.json app/_layout.tsx
git commit -m "chore(mobile): @gorhom/bottom-sheet 추가 및 GestureHandlerRootView 적용"
```

---

### Task 4: `CheckInListRow` 컴포넌트

**Files:**
- Create: `mobile/src/features/check-in/CheckInListRow.tsx`
- Test: `mobile/__tests__/CheckInListRow.test.tsx`

**Interfaces:**
- Consumes: `CheckIn`(`./domain`), `colors`(`../../shared/theme`)
- Produces: `CheckInListRow({ checkIn, isSelected, onPress }: { checkIn: CheckIn; isSelected: boolean; onPress: (id: string) => void })` — Task 5(`TodayMapSheet`)가 시트 리스트 아이템으로 그대로 사용한다. 루트에 `testID={`today-map-list-${checkIn.id}`}`, 시각 텍스트에 `testID="check-in-time"`를 붙인다.

- [ ] **Step 1: 실패하는 테스트 작성**

`mobile/__tests__/CheckInListRow.test.tsx`:

```tsx
import { fireEvent, render } from '@testing-library/react-native';

import { CheckInListRow } from '../src/features/check-in/CheckInListRow';
import type { CheckIn } from '../src/features/check-in/domain';

const checkIn: CheckIn = {
  id: 'c1',
  checkedInAt: '2026-08-06T00:15:00.000Z',
  capturedAt: '2026-08-06T00:14:58.000Z',
  latitude: 37.5,
  longitude: 127.0,
  accuracyM: 12,
  createdAt: '2026-08-06T00:15:00.000Z',
  syncStatus: 'pending',
};

describe('CheckInListRow', () => {
  it('shows the local time and rounded accuracy', async () => {
    const view = await render(<CheckInListRow checkIn={checkIn} isSelected={false} onPress={jest.fn()} />);

    expect(view.getByTestId('check-in-time').props.children).toBe('09:15');
    expect(view.getByText('정확도 약 12m')).toBeTruthy();
  });

  it('applies the selected style when isSelected is true', async () => {
    const view = await render(<CheckInListRow checkIn={checkIn} isSelected onPress={jest.fn()} />);

    const flattenedStyle = [view.getByTestId('today-map-list-c1').props.style].flat();
    expect(flattenedStyle).toEqual(expect.arrayContaining([expect.objectContaining({ borderColor: '#2e6af0' })]));
  });

  it('calls onPress with the check-in id when tapped', async () => {
    const onPress = jest.fn();
    const view = await render(<CheckInListRow checkIn={checkIn} isSelected={false} onPress={onPress} />);

    await fireEvent.press(view.getByTestId('today-map-list-c1'));
    expect(onPress).toHaveBeenCalledWith('c1');
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd mobile && npm test -- --runTestsByPath __tests__/CheckInListRow.test.tsx`
Expected: FAIL — `Cannot find module '../src/features/check-in/CheckInListRow'`

- [ ] **Step 3: 최소 구현 작성**

`mobile/src/features/check-in/CheckInListRow.tsx`:

```tsx
import { Pressable, StyleSheet, Text } from 'react-native';

import { colors } from '../../shared/theme';
import type { CheckIn } from './domain';

type CheckInListRowProps = {
  checkIn: CheckIn;
  isSelected: boolean;
  onPress: (id: string) => void;
};

function formatLocalTime(checkedInAt: string): string {
  return new Intl.DateTimeFormat('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(checkedInAt));
}

export function CheckInListRow({ checkIn, isSelected, onPress }: CheckInListRowProps) {
  return (
    <Pressable
      testID={`today-map-list-${checkIn.id}`}
      accessibilityRole="button"
      accessibilityLabel={`${formatLocalTime(checkIn.checkedInAt)} 체크인`}
      onPress={() => onPress(checkIn.id)}
      style={[styles.row, isSelected && styles.rowSelected]}
    >
      <Text testID="check-in-time" style={styles.time}>{formatLocalTime(checkIn.checkedInAt)}</Text>
      <Text style={styles.accuracy}>정확도 약 {Math.round(checkIn.accuracyM)}m</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: 16, gap: 4 },
  rowSelected: { borderColor: colors.primary, backgroundColor: colors.primarySoftBackground },
  time: { fontSize: 18, fontWeight: '700', color: colors.textPrimary },
  accuracy: { fontSize: 14, color: colors.textSecondary },
});
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd mobile && npm test -- --runTestsByPath __tests__/CheckInListRow.test.tsx`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
cd mobile
git add src/features/check-in/CheckInListRow.tsx __tests__/CheckInListRow.test.tsx
git commit -m "feat(check-in): 오늘 탭 시트용 CheckInListRow 컴포넌트 추가"
```

---

### Task 5: `TodayMapSheet` 화면 컴포넌트

**Files:**
- Create: `mobile/src/features/check-in/TodayMapSheet.tsx`
- Test: `mobile/__tests__/TodayMapSheet.test.tsx`

**Interfaces:**
- Consumes: `CheckInMapPins`(Task 1), `CheckInListRow`(Task 4), `MapRegion`(Task 2, 타입만), `CheckIn`(`./domain`)
- Produces: `TodayMapSheet({ checkIns, initialRegion, onStartCheckIn, onOpenReminderSettings }: { checkIns: CheckIn[]; initialRegion: MapRegion; onStartCheckIn: () => void; onOpenReminderSettings?: () => void })` — Task 6이 `(tabs)/index.tsx`에서 그대로 렌더링한다.

- [ ] **Step 1: 실패하는 테스트 작성**

`mobile/__tests__/TodayMapSheet.test.tsx`:

```tsx
jest.mock('react-native-maps', () => {
  const React = require('react');
  const { Pressable, View } = require('react-native');

  return {
    __esModule: true,
    default: ({ children, ...props }: { children?: React.ReactNode }) => (
      <View testID="today-map" {...props}>{children}</View>
    ),
    Marker: ({ onPress, testID, ...props }: { onPress?: () => void; testID?: string }) => (
      <Pressable testID={testID} onPress={onPress} {...props} />
    ),
    Polyline: (props: object) => <View testID="today-map-polyline" {...props} />,
  };
});

const mockSnapToIndex = jest.fn();
const mockScrollToIndex = jest.fn();

jest.mock('@gorhom/bottom-sheet', () => {
  const React = require('react');
  const { View, FlatList } = require('react-native');

  const BottomSheet = React.forwardRef(
    ({ children }: { children?: React.ReactNode }, ref: React.Ref<unknown>) => {
      React.useImperativeHandle(ref, () => ({ snapToIndex: mockSnapToIndex }));
      return <View testID="today-bottom-sheet">{children}</View>;
    },
  );

  const BottomSheetFlatList = React.forwardRef(
    (props: React.ComponentProps<typeof FlatList>, ref: React.Ref<unknown>) => {
      React.useImperativeHandle(ref, () => ({ scrollToIndex: mockScrollToIndex }));
      return <FlatList {...props} />;
    },
  );

  return { __esModule: true, default: BottomSheet, BottomSheetFlatList };
});

import { fireEvent, render, waitFor } from '@testing-library/react-native';

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
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd mobile && npm test -- --runTestsByPath __tests__/TodayMapSheet.test.tsx`
Expected: FAIL — `Cannot find module '../src/features/check-in/TodayMapSheet'`

- [ ] **Step 3: 최소 구현 작성**

`mobile/src/features/check-in/TodayMapSheet.tsx`:

```tsx
import { useCallback, useMemo, useRef, useState } from 'react';
import type { ElementRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import MapView from 'react-native-maps';
import BottomSheet, { BottomSheetFlatList, type BottomSheetFlatListMethods } from '@gorhom/bottom-sheet';

import { colors } from '../../shared/theme';
import { CheckInMapPins } from './CheckInMapPins';
import { CheckInListRow } from './CheckInListRow';
import type { MapRegion } from './resolveInitialMapRegion';
import type { CheckIn } from './domain';

type TodayMapSheetProps = {
  checkIns: CheckIn[];
  initialRegion: MapRegion;
  onStartCheckIn: () => void;
  onOpenReminderSettings?: () => void;
};

const SNAP_POINTS = ['14%', '50%', '92%'];
const PEEK_INDEX = 0;
const HALF_INDEX = 1;

export function TodayMapSheet({ checkIns, initialRegion, onStartCheckIn, onOpenReminderSettings }: TodayMapSheetProps) {
  const chronologicalCheckIns = useMemo(
    () => [...checkIns].sort((left, right) => Date.parse(left.checkedInAt) - Date.parse(right.checkedInAt)),
    [checkIns],
  );
  const [selectedCheckInId, setSelectedCheckInId] = useState<string | null>(null);
  const sheetRef = useRef<ElementRef<typeof BottomSheet>>(null);
  const listRef = useRef<BottomSheetFlatListMethods>(null);

  const selectFromPin = useCallback((id: string) => {
    setSelectedCheckInId(id);
    sheetRef.current?.snapToIndex(HALF_INDEX);
    const index = chronologicalCheckIns.findIndex((checkIn) => checkIn.id === id);
    if (index >= 0) {
      listRef.current?.scrollToIndex({ index, animated: true });
    }
  }, [chronologicalCheckIns]);

  return (
    <View style={styles.container}>
      <MapView style={styles.map} initialRegion={initialRegion}>
        <CheckInMapPins
          checkIns={chronologicalCheckIns}
          selectedCheckInId={selectedCheckInId}
          onSelectCheckIn={selectFromPin}
          testIDPrefix="today-map"
        />
      </MapView>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="지금 체크인"
        onPress={onStartCheckIn}
        style={styles.fab}
      >
        <Text style={styles.fabText}>＋</Text>
      </Pressable>

      <BottomSheet ref={sheetRef} index={PEEK_INDEX} snapPoints={SNAP_POINTS}>
        <View style={styles.sheetHeader}>
          <Text style={styles.title}>오늘</Text>
          {onOpenReminderSettings && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="알림 설정"
              onPress={onOpenReminderSettings}
              style={styles.settingsButton}
            >
              <Text style={styles.settingsButtonText}>알림 설정</Text>
            </Pressable>
          )}
        </View>

        {chronologicalCheckIns.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>오늘의 발자국이 아직 없어요.</Text>
            <Text style={styles.emptyBody}>지금 있는 곳을 첫 발자국으로 남겨 보세요.</Text>
          </View>
        ) : (
          <BottomSheetFlatList
            ref={listRef}
            data={chronologicalCheckIns}
            keyExtractor={(checkIn: CheckIn) => checkIn.id}
            contentContainerStyle={styles.list}
            renderItem={({ item }: { item: CheckIn }) => (
              <CheckInListRow
                checkIn={item}
                isSelected={item.id === selectedCheckInId}
                onPress={setSelectedCheckInId}
              />
            )}
          />
        )}
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { ...StyleSheet.absoluteFillObject },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 160,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  fabText: { color: colors.onPrimary, fontSize: 28, fontWeight: '700', lineHeight: 30 },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  title: { fontSize: 20, fontWeight: '700', color: colors.textPrimary },
  settingsButton: {
    borderRadius: 10,
    backgroundColor: colors.primarySoftBackground,
    paddingHorizontal: 12,
    minHeight: 44,
    justifyContent: 'center',
  },
  settingsButtonText: { color: colors.primarySoftText, fontSize: 14, fontWeight: '700' },
  emptyState: { paddingHorizontal: 20, paddingBottom: 24, gap: 8 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: colors.textPrimary },
  emptyBody: { fontSize: 15, lineHeight: 22, color: colors.textSecondary },
  list: { paddingHorizontal: 20, paddingBottom: 24, gap: 12 },
});
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd mobile && npm test -- --runTestsByPath __tests__/TodayMapSheet.test.tsx`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
cd mobile
git add src/features/check-in/TodayMapSheet.tsx __tests__/TodayMapSheet.test.tsx
git commit -m "feat(check-in): 지도+바텀시트 TodayMapSheet 화면 추가"
```

---

### Task 6: 오늘 탭 라우트를 `TodayMapSheet`로 교체

**Files:**
- Modify: `mobile/app/(tabs)/index.tsx`
- Delete: `mobile/src/features/check-in/TodayCheckIns.tsx`, `mobile/__tests__/TodayCheckIns.test.tsx`
- Test: `mobile/__tests__/TodayRoute.test.tsx` (신규, `TodayCheckIns.test.tsx` 대체)

**Interfaces:**
- Consumes: `TodayMapSheet`(Task 5), `resolveInitialMapRegion`/`MapRegion`(Task 2), `ExpoLocationGateway`(`./ExpoLocationGateway`, 기존)
- Produces: 오늘 탭이 지도+바텀시트 화면을 렌더링한다. 다른 태스크가 이 라우트를 소비하지 않는다.

- [ ] **Step 1: 실패하는 라우트 테스트 작성**

`mobile/__tests__/TodayRoute.test.tsx`:

```tsx
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
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd mobile && npm test -- --runTestsByPath __tests__/TodayRoute.test.tsx`
Expected: FAIL — `view.getByTestId('today-map')`를 찾지 못함 (라우트가 아직 `TodayMapSheet`를 렌더링하지 않음)

- [ ] **Step 3: 라우트 구현 교체**

`mobile/app/(tabs)/index.tsx` 전체를 아래로 교체한다:

```tsx
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useFootLogRepository } from '../../src/database/FootLogContext';
import { localDateAndTimezone } from '../../src/shared/localDate';
import { colors } from '../../src/shared/theme';
import { TodayMapSheet } from '../../src/features/check-in/TodayMapSheet';
import { ExpoLocationGateway } from '../../src/features/check-in/ExpoLocationGateway';
import { resolveInitialMapRegion, type MapRegion } from '../../src/features/check-in/resolveInitialMapRegion';
import type { CheckIn } from '../../src/features/check-in/domain';

export default function TodayRoute() {
  const router = useRouter();
  const repository = useFootLogRepository();
  const [checkIns, setCheckIns] = useState<CheckIn[]>([]);
  const [initialRegion, setInitialRegion] = useState<MapRegion | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let isCurrent = true;
      const { localDate, timezone } = localDateAndTimezone();
      setIsLoading(true);
      setHasError(false);

      const locationGateway = new ExpoLocationGateway();
      const locationFix = locationGateway.requestForegroundPermission()
        .then((permission) => (permission === 'granted' ? locationGateway.getCurrentFix() : null))
        .catch(() => null);

      void Promise.all([repository.listByLocalDay(localDate, timezone), locationFix])
        .then(([records, fix]) => {
          if (!isCurrent) return;
          setCheckIns(records);
          setInitialRegion(resolveInitialMapRegion(fix, records));
        })
        .catch(() => {
          if (isCurrent) setHasError(true);
        })
        .finally(() => {
          if (isCurrent) setIsLoading(false);
        });

      return () => { isCurrent = false; };
    }, [repository]),
  );

  return (
    <SafeAreaView style={styles.container}>
      {isLoading || !initialRegion ? (
        <View style={styles.centered}><Text style={styles.message}>오늘의 발자국을 불러오는 중이에요.</Text></View>
      ) : hasError ? (
        <View style={styles.centered}><Text style={styles.message}>오늘의 발자국을 불러오지 못했어요.</Text></View>
      ) : (
        <TodayMapSheet
          checkIns={checkIns}
          initialRegion={initialRegion}
          onStartCheckIn={() => router.push('/check-in')}
          onOpenReminderSettings={() => router.push('/settings/reminders')}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  message: { fontSize: 16, color: colors.textSecondary, textAlign: 'center' },
});
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd mobile && npm test -- --runTestsByPath __tests__/TodayRoute.test.tsx`
Expected: PASS

- [ ] **Step 5: 옛 `TodayCheckIns` 컴포넌트와 테스트 삭제**

```bash
cd mobile
git rm src/features/check-in/TodayCheckIns.tsx __tests__/TodayCheckIns.test.tsx
```

- [ ] **Step 6: 전체 테스트 스위트 통과 확인 (회귀 검증)**

Run: `cd mobile && npm test`
Expected: PASS — 삭제된 `TodayCheckIns`를 참조하는 곳이 없어야 한다.

- [ ] **Step 7: 커밋**

```bash
cd mobile
git add app/\(tabs\)/index.tsx __tests__/TodayRoute.test.tsx
git commit -m "feat(check-in): 오늘 탭을 지도+바텀시트로 교체"
```

---

### Task 7: 전체 검증 및 시뮬레이터 빌드 확인

**Files:** 없음 (검증 전용 태스크)

**Interfaces:** 없음

- [ ] **Step 1: 전체 자동 검사 실행**

```bash
cd mobile
nvm use 24
npm test
npm run typecheck
npm run lint
npx expo-doctor
```

Expected: 네 명령 모두 오류 없이 통과한다.

- [ ] **Step 2: iOS 시뮬레이터 네이티브 빌드 확인**

```bash
cd mobile
npx expo run:ios --no-bundler
```

Expected: 빌드가 성공하고 앱이 iPhone 17 Pro 시뮬레이터에 설치·실행된다. `@gorhom/bottom-sheet`가 새 네이티브 의존성이므로, `npm install` 이후 처음 하는 네이티브 빌드에서 실패하면 여기서 걸러야 한다.

- [ ] **Step 3: 시뮬레이터에서 수동 확인**

다음을 시뮬레이터에서 직접 확인한다(자동화 테스트로 검증하기 어려운 실제 제스처 영역):

- 오늘 탭 진입 시 위치 권한 다이얼로그가 뜨고, 허용하면 지도가 현재 위치를 중심으로 표시된다.
- 지도 우하단 FAB로 체크인 흐름에 진입할 수 있다.
- 바텀시트를 손가락으로 끌어 peek/half/full 세 단계로 움직일 수 있다.
- 지도 핀을 탭하면 시트가 half로 확장되고 해당 체크인 카드로 스크롤된다.
- 시트의 카드를 탭하면 지도에서 해당 핀이 강조된다.
- 오늘 체크인이 없는 상태에서도 지도와 빈 상태 안내, FAB가 정상적으로 보인다.

- [ ] **Step 4: 최종 커밋 (필요 시)**

Step 1-3에서 발견된 문제를 수정했다면, 그 수정 사항을 별도로 커밋한다:

```bash
cd mobile
git add -A
git commit -m "fix(check-in): 시뮬레이터 검증 중 발견된 오늘 탭 지도+시트 이슈 수정"
```

수정할 내용이 없었다면 이 스텝은 생략한다.
