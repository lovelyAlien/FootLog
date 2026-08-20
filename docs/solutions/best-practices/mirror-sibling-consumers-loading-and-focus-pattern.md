---
title: "같은 레포지토리 메서드의 두 번째 소비자를 만들 때는 첫 번째 소비자 컴포넌트의 로딩/포커스 패턴도 따라야 함"
date: 2026-08-20
category: best-practices
module: "mobile/app/(tabs)/calendar.tsx (CheckInRepository.listByLocalDay의 두 번째 소비자)"
problem_type: best_practice
component: development_workflow
severity: high
applies_when:
  - "이미 다른 화면/컴포넌트가 소비하고 있는 레포지토리 메서드(예: CheckInRepository.listByLocalDay)를 새 화면에서 재사용할 때"
  - "그 메서드를 useEffect 안에서 호출해 결과로 setState할 때"
  - "탭 내비게이션처럼 화면이 마운트된 채로 유지되는(React Navigation 탭 등) 환경에서 데이터를 로드하는 화면을 새로 작성할 때"
  - "기존 소비자 코드를 참고할 때 '메서드를 어떻게 호출하는지'만 보고 '그 컴포넌트가 로딩 상태·리페치를 어떻게 관리하는지'는 확인하지 않을 때"
symptoms:
  - "react-hooks/set-state-in-effect ESLint 오류 — useEffect 본문에서 setState를 동기적으로 호출함"
  - "탭을 재방문해도 데이터가 갱신되지 않음 — 오늘 탭에서 체크인 후 캘린더 탭으로 돌아와도 이전에 보던 날짜의 체크인 개수/요약이 그대로 남아 있음"
  - "두 결함 모두 자동 테스트/typecheck/lint 1차 통과 후가 아니라 최종 전체 브랜치 코드 리뷰에서만 발견됨"
root_cause: missing_workflow_step
resolution_type: code_fix
related_components:
  - testing_framework
tags:
  - react-hooks
  - set-state-in-effect
  - use-focus-effect
  - stale-data
  - repository-pattern
  - code-review
  - react-navigation
  - expo-router
---

# 같은 레포지토리 메서드의 두 번째 소비자를 만들 때는 첫 번째 소비자 컴포넌트의 로딩/포커스 패턴도 따라야 함

## Context

캘린더 날짜 미리보기 패널(`mobile/app/(tabs)/calendar.tsx`)을 구현하던 중, 계획서는 새 쿼리를 만들지 말고 기존 저장소 메서드 `CheckInRepository.listByLocalDay(localDate, timezone)`를 재사용하라고 정확히 지시했다. 그런데 그 재사용 지시는 메서드 시그니처까지만 다뤘다 — *무엇을* 호출할지는 알려줬지만, 그 메서드의 기존 소비자들이 호출을 감싼 React 코드를 *어떻게* 구조화했는지는 확인하라고 하지 않았다.

이미 존재하던 두 소비자가 새 캘린더 코드가 처음부터 다시 만들어낼 뻔한 문제를 이미 해결해 두고 있었다.

- `mobile/src/features/daily-reflection/useDailyDetail.ts`(41번째 줄에서 `checkInRepository.listByLocalDay(...)` 호출)는 "effect 본문에서 setState를 동기 호출하지 않는다" 문제를 이미 해결해 두었다.
- `mobile/app/(tabs)/index.tsx`(56번째 줄에서 `repository.listByLocalDay(...)` 호출)는 "이 화면은 탭 전환 후에도 마운트된 채로 남아 있어서, plain `useEffect`로는 재포커스 시 다시 fetch되지 않는다" 문제를 85번째 줄의 `useFocusEffect(useCallback(() => load(), [load]))`로 이미 해결해 두었다.

구현 중 태스크 단위 리뷰는 두 문제 중 어느 것도 잡아내지 못했다. 두 버그 모두 모든 태스크가 각자의 좁은 리뷰를 통과한 뒤에 실행한 **전체 브랜치 리뷰**에서야 드러났다. 새 파일을 같은 저장소 메서드를 쓰는 형제 소비자들과 나란히 놓고 비교해야만 보이는 패턴이지, 그 태스크 자신의 완료 기준만 놓고 리뷰해서는 보이지 않기 때문이다. 이것이 관련된 프로세스 교훈이다 — 태스크 단위 리뷰는 "이 태스크 코드가 동작하는가"를 확인하지, "이 태스크 코드가 형제 파일이 이미 풀어둔 문제를 다시 만들어내지는 않았는가"는 확인하지 않는다.

## Guidance

계획서가 "기존 저장소 메서드/API 클라이언트/데이터 소스 함수를 재사용하라"고 지시하면, 그 메서드의 **모든 기존 호출 지점**을 찾아서 그 지점을 감싼 React 관례(로딩 상태 처리 순서, 재포커스/리마운트 대응, 오류 폴백 형태, cleanup/stale 응답 가드)까지 그대로 따르라는 지시로 받아들여야 한다. 메서드 시그니처는 "재사용"의 절반일 뿐이다 — 이미 확립된 관례가 있는 코드베이스에서는 나머지 절반이 그 관례를 따르는 것이다.

`listByLocalDay`의 경우 구체적으로 다음 두 관례가 기대됐지만 `calendar.tsx` 초안에는 빠져 있었다.

1. **effect 본문 맨 위에서 setState를 동기 호출하지 않는다.** `useDailyDetail.ts:35-37`은 `void Promise.resolve().then(() => { if (isCurrent) setState({ status: 'loading' }); })`로 로딩 상태 갱신을 지연시킨다 — effect 안에서 `setState('loading')`을 바로 호출하지 않는다. React의 `react-hooks/set-state-in-effect` 규칙은 effect 본문에서의 *동기* `setState` 호출을 ESLint **오류**로 잡아내며, 이는 이 프로젝트의 계획 체크리스트가 명시적으로 요구하는 `npm run lint` 단계를 실패시킨다(`CLAUDE.md` "개발 명령"의 모바일 lint 순서 참고).

2. **탭 전환 후에도 마운트 상태가 유지되는 화면에서는 `useEffect`가 아니라 `useFocusEffect`를 쓴다.** `index.tsx:85` — `useFocusEffect(useCallback(() => load(), [load]));` — 는 탭이 다시 포커스를 받을 때마다 `load()`를 재실행한다. plain `useEffect(fn, [deps])`는 `deps`가 바뀔 때만 재실행되는데, React Navigation의 탭 내비게이터는 한 번 방문한 화면을 계속 마운트된 채로 유지하므로, 오늘 탭에서 체크인하고 캘린더 탭으로 돌아온 사용자는 plain `useEffect` 아래에서는 영원히 오래된 데이터를 보게 된다.

### `calendar.tsx`에 실제로 적용한 수정

- **버그 1 수정 — date-keyed `PreviewState`, effect 안에서는 아예 동기 `setState`를 호출하지 않음.** `useDailyDetail`의 `Promise.resolve().then(...)` 지연 패턴을 그대로 옮기는 대신, `calendar.tsx`는 상태 자체가 자신이 어떤 날짜를 describe하는지 갖도록 재구성했다.

  ```ts
  // calendar.tsx:34-37
  type PreviewState =
    | { date: string; status: 'loading' }
    | { date: string; status: 'loaded'; checkIns: CheckIn[] }
    | { date: string; status: 'error' };
  ```

  프리뷰 fetch effect(`calendar.tsx:64-79`)는 effect가 시작될 때 `setPreview({ status: 'loading' })`를 동기 호출하지 않는다 — `setPreview`는 오직 `.then`/`.catch` 콜백 안, 즉 비동기적으로만 호출된다.

  ```ts
  // calendar.tsx:64-79
  useFocusEffect(useCallback(() => {
    if (!selectedDate) return undefined;
    const date = selectedDate;
    let isCurrent = true;
    void repository.listByLocalDay(date, timezone)
      .then((checkIns) => { if (isCurrent) setPreview({ date, status: 'loaded', checkIns }); })
      .catch(() => {
        if (!isCurrent) return;
        if (isDefaultSelection) { setSelectedDate(null); }
        else { setPreview({ date, status: 'error' }); }
      });
    return () => { isCurrent = false; };
  }, [selectedDate, repository, timezone, isDefaultSelection]));
  ```

  로딩 UI는 대신 렌더링 시점에 `preview.date`와 `selectedDate`를 비교해서 파생시킨다.

  ```ts
  // calendar.tsx:161
  {(preview.date !== selectedDate || preview.status === 'loading') && (
    <ActivityIndicator color={colors.primary} />
  )}
  ```

  이렇게 하면 ESLint 규칙 자체를 피하게 되고(effect 본문에 동기 `setState` 호출이 아예 없으므로), 부수적으로 날짜 전환 시 한 프레임 동안 이전 날짜의 내용이 잠깐 보이는 문제도 함께 해결됐다 — 이전 `PreviewState`는 `date` 필드가 없어서 자신이 *직전* 선택을 describe하고 있다는 걸 알 방법이 없었다.

- **버그 2 수정 — 캘린더의 두 effect 모두 `useFocusEffect`로 전환.** `calendar.tsx:62`(점 목록 조회)와 `calendar.tsx:64`(프리뷰 fetch) 둘 다 이제 `useFocusEffect(useCallback(...))`를 쓰며, `index.tsx:85`와 정확히 같은 패턴이다.

## Why This Matters

두 버그 모두 "재사용 확인이 메서드 시그니처에서 멈췄다"는 하나의 오류에서 비롯됐지만, 서로 다른 방식으로 비용을 유발한다.

- **버그 1은 단순한 스타일 지적이 아니라 확실한 lint 게이트 실패다.** `react-hooks/set-state-in-effect`는 ESLint **오류**로 설정돼 있다. `npm run lint`는 이 프로젝트의 모바일 체크 순서(`CLAUDE.md` 개발 명령)와 Superpowers 계획 체크리스트가 명시적으로 요구하는 단계다. effect 본문의 동기 `setState`는 단지 지저분해 보이는 정도가 아니라 빌드 파이프라인 자체를 막는다.
- **버그 2는 lint나 타입 문제가 아니라 실제 사용자에게 보이는 정합성 버그다.** 오늘 탭에서 체크인하고 완전한 리마운트 없이 캘린더 탭으로 전환한 사용자는 오류도, lint 신호도 없이 조용히 직전에 보던 날짜의 프리뷰가 체크인 이전 개수로 남아 있는 걸 보게 된다.
- **메타 교훈 — 커버리지를 고치는 수정 자체가 커버리지 0으로 배포될 수 있다.** 버그 2를 처음 고칠 때, `CalendarScreen.test.tsx`의 `expo-router` mock을 `useFocusEffect`가 순수 `useEffect` 패스스루처럼 동작하도록 바꿔서 기존 10개 테스트가 수정 없이 통과하게 만들었다. 그 mock은 정작 그 마이그레이션 자체를 테스트 불가능하게 만들었다 — `calendar.tsx`를 `useFocusEffect`에서 다시 plain `useEffect`로 되돌려도 모든 테스트가 여전히 통과했을 것이다. 즉 그 수정이 정작 자신이 닫으려던 버그에 대한 회귀 방지 장치 없이 배포될 뻔했다. 2차 리뷰어가 이를 병합 전에 잡아냈다. 이 교훈은 이 버그 하나에 국한되지 않는다 — mock을 기존 테스트가 계속 통과하도록 조정하는 방식으로 "커버리지"를 확보했다면, 그 새 테스트가 예전 코드에서는 실패(RED)하고 새 코드에서는 통과(GREEN)하는지 명시적으로 검증하라 — "테스트가 여전히 통과한다"가 "테스트가 회귀를 잡아낼 것이다"를 의미하지 않는다.

## When to Apply

계획이나 태스크가 **이미 코드베이스 어딘가에서 쓰이고 있는** 저장소 메서드, API 클라이언트 함수, 훅, 기타 데이터 소스 추상화를 호출하라고 할 때는 언제나 적용한다 — `listByLocalDay`에 국한되지 않는다. 새 호출 지점을 작성하기 전에:

1. 같은 메서드/함수의 다른 호출 지점을 grep으로 찾는다.
2. 각각을 열어서 확인한다 — 로딩 상태를 어떤 순서로 처리하는가(동기 vs 지연된 `setState`)? 이 화면은 `useFocusEffect`가 필요한가(마운트 상태가 유지되는 탭 내비게이터 화면) 아니면 plain `useEffect`로 충분한가(항상 다시 마운트되는 화면)? stale 응답 경쟁 상태는 어떻게 막는가(`isCurrent` 플래그)? 오류 경로는 어떻게 저하되는가(조용한 폴백 vs 인라인 오류 — `calendar.tsx:70-77`의 `isDefaultSelection` 분기처럼)?
3. 기존 소비자의 관례에서 벗어나야 할 때는 새 화면의 요구사항이 실제로 다른 경우에만 그렇게 하고, 왜 다른지 남겨 둔다 — 그러지 않으면 나중에 전체 브랜치 리뷰어가 불일치를 지적하게 된다.

이 확인은 여기서 예방할 수 있었던 두 개의 Important급 버그에 비하면 비용이 저렴하다. 이번 세션의 결론에 따르면, 이런 종류의 문제는 태스크 단위의 좁은 리뷰로는 구조적으로 잡아내기 어렵고, 전체 브랜치 리뷰나 파일 간 비교 리뷰를 거쳐야만 드러난다.

## Examples

**Before (버그 1 — effect 안 동기 `setState`, ESLint 오류):**

```ts
useEffect(() => {
  setPreview({ status: 'loading' }); // react-hooks/set-state-in-effect 오류
  void repository.listByLocalDay(selectedDate, timezone)
    .then((checkIns) => setPreview({ status: 'loaded', checkIns }))
    .catch(() => setPreview({ status: 'error' }));
}, [selectedDate, repository, timezone]);
```

**After (`calendar.tsx:34-37, 64-79, 161`의 실제 수정) — date-keyed 상태, 동기 `setState` 없음, 로딩 UI는 렌더링 시점에 파생:**

```ts
type PreviewState =
  | { date: string; status: 'loading' }
  | { date: string; status: 'loaded'; checkIns: CheckIn[] }
  | { date: string; status: 'error' };

useFocusEffect(useCallback(() => {
  if (!selectedDate) return undefined;
  const date = selectedDate;
  let isCurrent = true;
  void repository.listByLocalDay(date, timezone)
    .then((checkIns) => { if (isCurrent) setPreview({ date, status: 'loaded', checkIns }); })
    .catch(() => { if (isCurrent) setPreview({ date, status: 'error' }); });
  return () => { isCurrent = false; };
}, [selectedDate, repository, timezone]));

// 렌더링:
{(preview.date !== selectedDate || preview.status === 'loading') && <ActivityIndicator />}
```

**Before (버그 2 — plain `useEffect`, 탭 재포커스에도 재실행되지 않음):**

```ts
useEffect(() => { loadDots(); }, [loadDots]);
```

**After (`calendar.tsx:62`의 실제 수정, `index.tsx:85`를 그대로 따름):**

```ts
useFocusEffect(useCallback(() => { loadDots(); }, [loadDots]));
```

**Mock 패턴 — 단순 패스스루 (near-miss, 수정을 테스트 불가능하게 만듦):**

```ts
jest.mock('expo-router', () => ({
  useFocusEffect: (effect: () => void | (() => void)) => {
    const { useEffect } = require('react');
    useEffect(effect, [effect]); // 마운트/deps 변경 시에만 실행됨 — useEffect와 구별 불가능
  },
  useRouter: () => ({ push: mockPush }),
}));
```
기존 테스트는 이 mock으로도 모두 통과했다 — 그리고 `calendar.tsx`가 plain `useEffect`로 되돌아가도 여전히 통과했을 것이다. mock이 애초에 재포커스를 재현할 수 없었기 때문이다.

**Mock 패턴 — 실제 수정, slot-capturing (`CalendarScreen.test.tsx:1-26`), 회귀에 실질적인 이빨을 갖게 함:**

```ts
// calendar.tsx는 useFocusEffect를 두 번 호출하며, React의 훅 호출 순서 보장 덕분에
// 항상 같은 텍스트 순서(점 목록 조회가 먼저, 프리뷰 fetch가 두 번째)로 호출된다.
// 이 mock은 각 호출 지점을 순서 기반 슬롯에 캡처해 두어서, 테스트가
// mockFocusEffects[n]?.()로 특정 effect를 수동으로 재호출해 재포커스를 시뮬레이션할 수 있게 한다.
const mockFocusEffects: ((() => void | (() => void)) | undefined)[] = [];
let mockFocusEffectCursor = 0;

jest.mock('expo-router', () => {
  const { useEffect } = require('react');
  return {
    useFocusEffect: (effect: () => void | (() => void)) => {
      mockFocusEffects[mockFocusEffectCursor % 2] = effect;
      mockFocusEffectCursor += 1;
      useEffect(effect, [effect]); // 마운트 시에는 여전히 자동 실행되므로 기존 테스트는 그대로 통과
    },
    useRouter: () => ({ push: mockPush }),
  };
});
```

그리고 이 mock이 가능하게 하는 새 회귀 테스트(`CalendarScreen.test.tsx:217-247`) — 캡처된 두 effect를 수동으로 재호출해 실제 재포커스를 시뮬레이션하고, 저장소가 두 번째로 호출됐는지 검증한다.

```ts
it("reloads dots and the selected date's preview when the screen regains focus", async () => {
  // ...mockRepository는 호출마다 다른 값을 반환하도록 설정...
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

이 테스트는 단순 패스스루 mock과 plain `useEffect`로 되돌린 `calendar.tsx` 조합에서는 실패한다(재호출을 트리거할 두 번째 호출이 없으므로), 실제 `useFocusEffect` 수정에서는 통과한다 — 이것이 첫 시도의 mock에는 없었던 RED/GREEN 속성이다.

## Related

- [third-party-mock-must-reproduce-runtime-invariants.md](../best-practices/third-party-mock-must-reproduce-runtime-invariants.md) — 같은 "mock이 실제 동작을 재현하지 못하면 회귀 커버리지도 없다"는 원칙을 다루지만, 그 문서는 서드파티 UI 라이브러리(bottom-sheet, VirtualizedList, react-native-maps) mock을 대상으로 하고 이 문서는 1st-party React 훅(`useFocusEffect`) mock을 대상으로 한다는 점에서 서로 다른 기술 표면을 다룬다.
- [mock-must-allow-manual-invocation-for-real-regression-coverage.md](../best-practices/mock-must-allow-manual-invocation-for-real-regression-coverage.md) — 이 문서에서 다룬 `useFocusEffect` 도입을 뒷받침하는 테스트 mock을 실제로 방어력 있게 만드는 방법을 다룬 후속 문서.
