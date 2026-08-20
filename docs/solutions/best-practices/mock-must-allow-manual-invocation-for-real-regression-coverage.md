---
title: "생명주기 훅을 흉내 내는 mock을 만들 때, 마운트 시 자동 실행만으로는 그 훅으로 바꾼 이유 자체를 검증하지 못한다"
date: 2026-08-20
category: best-practices
module: "mobile/__tests__/CalendarScreen.test.tsx (expo-router의 useFocusEffect mock)"
problem_type: best_practice
component: testing_framework
applies_when:
  - "React Navigation의 useFocusEffect처럼, 마운트 시점이 아니라 특정 생명주기 이벤트(재포커스, 재방문 등)에 반응하는 훅을 mock할 때"
  - "기존 테스트가 깨지지 않도록 mock을 useEffect 같은 더 단순한 훅으로 패스스루(passthrough)하고 싶을 때"
  - "버그 수정으로 훅을 A에서 B로 바꾸면서, 기존 테스트가 여전히 통과한다는 사실만으로 회귀 방지가 됐다고 판단하려 할 때"
symptoms:
  - "useEffect를 useFocusEffect로 바꾸는 버그 수정을 했는데, 그 수정을 되돌려도(원래 useEffect로) 모든 테스트가 여전히 통과함"
  - "mock이 실제 생명주기 이벤트(재포커스 등)를 시뮬레이션할 방법을 제공하지 않음 — 마운트 시 한 번 실행되는 것 외에는 아무 것도 하지 않음"
root_cause: test_isolation
resolution_type: test_fix
related_components:
  - development_workflow
tags:
  - mock-fidelity
  - use-focus-effect
  - regression-coverage
  - jest
  - react-native-testing-library
  - red-green
---

# 생명주기 훅을 흉내 내는 mock을 만들 때, 마운트 시 자동 실행만으로는 그 훅으로 바꾼 이유 자체를 검증하지 못한다

## Context

캘린더 날짜 미리보기 화면(`mobile/app/(tabs)/calendar.tsx`)에서, 탭을 재방문해도 데이터가 갱신되지 않는 버그를 고치려고 두 개의 데이터 로딩 effect를 `useEffect`에서 `useFocusEffect`(`expo-router`가 React Navigation에서 재노출하는 훅)로 바꿨다. 이 변경 자체는 올바른 수정이었다. 문제는 그 수정을 뒷받침하는 테스트를 만드는 과정에서 생겼다.

`mobile/__tests__/CalendarScreen.test.tsx`는 기존에 10개의 테스트를 갖고 있었고, 전부 `expo-router`를 mock한 채로 마운트 시점의 동작만 검증하고 있었다. `useFocusEffect`로 바꾸면서 이 mock도 함께 손봐야 했는데, 첫 시도는 다음과 같았다.

```ts
jest.mock('expo-router', () => ({
  useFocusEffect: (effect: () => void | (() => void)) => {
    const { useEffect } = require('react');
    useEffect(effect, [effect]); // 마운트/deps 변경 시에만 실행 — useEffect와 구별 불가능
  },
  useRouter: () => ({ push: mockPush }),
}));
```

이 mock은 기존 10개 테스트를 전부 그대로 통과시켰다. 그런데 바로 그 이유 때문에 문제였다 — `useFocusEffect`가 실제로 제공하는 것(재포커스 시 재실행)을 이 mock은 전혀 흉내 내지 못했고, 그래서 이 mock 아래에서는 `calendar.tsx`를 다시 `useEffect`로 되돌려도 모든 테스트가 여전히 통과했을 것이다. 즉, "탭 재방문 시 데이터 갱신"이라는 버그 수정 자체에 대한 회귀 방지 테스트가 전혀 없는 상태였다. 이 문제는 전체 브랜치 리뷰에서 발견됐고, 리뷰어는 "이 mock이 `useFocusEffect`를 `useEffect`로 되돌려도 통과하는가?"라는 질문을 직접 던져서 확인했다.

## Guidance

생명주기/이벤트 기반 훅(마운트 시가 아니라 특정 조건에서 콜백이 실행되는 훅 — `useFocusEffect`, 구독 콜백, 이벤트 리스너 등)을 mock할 때는, mock이 두 가지를 모두 만족해야 실질적인 회귀 커버리지를 준다.

1. **기존 테스트를 위해 마운트 시 자동 실행을 유지한다** (하위 호환).
2. **동시에, 그 콜백을 테스트가 나중에 수동으로 다시 호출할 수 있도록 캡처해 둔다** — 그래야 새 테스트가 "이벤트가 다시 발생했다"를 실제로 시뮬레이션할 수 있다.

`calendar.tsx`는 `useFocusEffect`를 두 곳(점 목록 조회, 프리뷰 fetch)에서 호출하는데, React의 훅 호출 순서 보장 덕분에 매 렌더마다 항상 같은 텍스트 순서로 호출된다. 이를 이용해 순서 기반 슬롯에 각 콜백을 캡처하는 mock으로 다시 작성했다.

```ts
// mobile/__tests__/CalendarScreen.test.tsx:1-26
const mockFocusEffects: ((() => void | (() => void)) | undefined)[] = [];
let mockFocusEffectCursor = 0;

jest.mock('expo-router', () => {
  const { useEffect } = require('react');
  return {
    useFocusEffect: (effect: () => void | (() => void)) => {
      mockFocusEffects[mockFocusEffectCursor % 2] = effect;
      mockFocusEffectCursor += 1;
      useEffect(effect, [effect]); // 마운트 시에는 여전히 자동 실행 — 기존 테스트는 그대로 통과
    },
    useRouter: () => ({ push: mockPush }),
  };
});
```

새 테스트는 캡처된 콜백을 `act(...)` 안에서 수동으로 재호출해 실제 재포커스를 시뮬레이션한다.

```ts
// mobile/__tests__/CalendarScreen.test.tsx:217-247 (요지)
it("reloads dots and the selected date's preview when the screen regains focus", async () => {
  // ...mockRepository는 첫 번째/두 번째 호출에 서로 다른 값을 반환하도록 설정...
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
```

## Why This Matters

기존 테스트가 "여전히 통과한다"는 사실은 mock이 올바르다는 증거가 아니다 — mock이 아무것도 하지 않아도(패스스루조차 없이) 마운트 시점만 검증하는 기존 테스트는 여전히 통과할 수 있다. 회귀 방지가 실제로 존재하는지 확인하는 유일한 방법은, 고치기 전 코드(`useEffect`)와 고친 후 코드(`useFocusEffect`) 양쪽에 새 테스트를 돌려서 전자에서는 실패(RED)하고 후자에서는 통과(GREEN)하는지 직접 확인하는 것이다. 이 세션에서는 수정을 임시로 되돌려 새 테스트가 실제로 실패하는지 확인한 뒤 다시 복원하는 방식으로 이를 검증했다 — 이 RED/GREEN 확인이 없었다면 "테스트를 추가했다"는 보고만 있고 실제 방어력은 없는 상태로 병합될 뻔했다.

## When to Apply

- React Navigation의 `useFocusEffect`/`useIsFocused`처럼 마운트 이후의 특정 이벤트에 반응하는 훅을 처음 mock할 때.
- 이미 있는 mock을 "기존 테스트가 깨지지 않게" 조정해야 하는 상황일 때 — 그 조정이 훅의 핵심 동작(이번 경우 재포커스 시 재실행)을 제거해버리지 않는지 항상 되짚어본다.
- 버그 수정으로 훅 A를 훅 B로 바꿨는데, 그 수정을 검증하는 새 테스트가 없거나, 있어도 A로 되돌리면 여전히 통과할 것 같다면 — 그 테스트는 아직 회귀 방지 역할을 하지 못하는 것이다.

## Examples

**Before — 마운트 전용 패스스루 (근본적으로 재포커스를 시뮬레이션할 수 없음):**

```ts
useFocusEffect: (effect) => {
  const { useEffect } = require('react');
  useEffect(effect, [effect]);
},
```

**After — 슬롯 캡처 + 마운트 자동 실행 유지 (하위 호환과 수동 재호출을 모두 제공):**

```ts
const mockFocusEffects: ((() => void | (() => void)) | undefined)[] = [];
let mockFocusEffectCursor = 0;

useFocusEffect: (effect) => {
  mockFocusEffects[mockFocusEffectCursor % 2] = effect;
  mockFocusEffectCursor += 1;
  const { useEffect } = require('react');
  useEffect(effect, [effect]);
},
```

같은 화면이 훅을 하나만 호출한다면 슬롯 배열 대신 단일 변수(`mockFocusEffect = effect`)로 충분하다 — 이 저장소의 `mobile/__tests__/TodayRoute.test.tsx`가 그 단일 호출 지점 패턴의 선례다.

## Related

- [mirror-sibling-consumers-loading-and-focus-pattern.md](../best-practices/mirror-sibling-consumers-loading-and-focus-pattern.md) — 이 mock을 필요하게 만든 원래 `useFocusEffect` 도입 자체를 다룬 문서. 이 문서는 그 수정을 뒷받침하는 테스트 mock이 실제로 방어력을 갖도록 만드는 방법을 다룬다.
- [third-party-mock-must-reproduce-runtime-invariants.md](../best-practices/third-party-mock-must-reproduce-runtime-invariants.md) — "mock이 실제 동작을 재현하지 못하면 회귀 커버리지도 없다"는 같은 원칙을 서드파티 UI 라이브러리 mock(바텀시트, VirtualizedList 등)에 적용한 문서.
