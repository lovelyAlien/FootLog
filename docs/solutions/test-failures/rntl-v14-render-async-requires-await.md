---
title: "@testing-library/react-native@14 render/renderHook/act 비동기 처리 누락"
date: 2026-08-17
category: test-failures
module: "@testing-library/react-native (Jest integration)"
problem_type: test_failure
component: testing_framework
symptoms:
  - "render()/renderHook() 결과에 쿼리 메서드(getByText, getByRole 등)를 호출하면 \"is not a function\" 런타임 에러 발생"
  - "await 없이 renderHook()을 호출하면 result가 Promise라 result.current 접근이 깨짐"
  - "await 없는 act() 호출 뒤 업데이트가 아직 flush되지 않아 타이밍에 의존하는 assertion이 실패할 수 있음"
root_cause: wrong_api
resolution_type: test_fix
severity: medium
related_components:
  - development_workflow
  - testing_framework
tags:
  - testing-library
  - react-native
  - jest
  - async-await
  - expo
  - rntl
  - test-failure
---

# @testing-library/react-native@14 render/renderHook/act 비동기 처리 누락

## Problem

`mobile/package.json`에 `@testing-library/react-native`가 `^14.0.1`로 고정되어 있는데, 이 버전의 `render`, `renderHook`, `act`는 동기적으로 결과를 반환하지 않고 비동기(Promise)로 동작한다. `docs/superpowers/plans/2026-08-17-daily-reflection-ui.md`(14개 태스크) 실행 중 서로 다른 4개 태스크(9, 10, 11, 13)의 구현 서브에이전트가 각각 새 Jest 테스트 파일을 작성하면서 독립적으로 이 문제에 부딪혔고, 그때마다 동일한 한 줄짜리 수정(`await` 추가)을 처음부터 다시 발견했다. 문제 자체는 사소하지만, 같은 교훈이 문서화되지 않아 매번 반복 비용이 든 것이 핵심이다.

## Symptoms

- `await` 없이 호출한 `render(...)`의 반환값에 `getByText`/`getByRole` 등 쿼리 메서드를 호출하면 "is not a function" 형태의 런타임 에러가 발생한다. 호출 대상이 resolve되지 않은 `Promise`이기 때문이다.
- `renderHook(...)`도 동일하게 비동기다. `await` 없이 `{ result }`를 구조분해하면 `result`가 `Promise`이거나 잘못된 형태가 되어 `result.current` 접근이 깨진다.
- `act(...)`도 같은 계약을 따른다. `await` 없이 호출하면 상태 업데이트가 flush되기 전에 뒤이은 코드가 실행되어, 타이밍에 의존하는 assertion이 간헐적으로 실패할 수 있다.
- 이 실패들은 테스트 대상 컴포넌트·훅의 로직 문제가 아니라 순전히 테스트 코드의 `await` 누락이었다 — 네 태스크 모두 구현 자체는 첫 시도에 올바르게 작성되어 있었다.

## What Didn't Work

기술적으로 막힌 시도는 없었다 — 각 태스크는 에러를 만나자마자 `await`를 붙이는 올바른 수정을 빠르게 찾아냈다. 진짜 문제는 그 발견이 어디에도 남지 않았다는 것이다. 최초 발견(Task 9)조차 사실 새로운 사실이 아니었다 — 이 계획 문서 이전에 이미 존재하던 `mobile/__tests__/TodayCheckIns.test.tsx`가 이미 `await render(...)`를 일관되게 쓰고 있었다(Task 9 리뷰어가 직접 대조 확인). 즉 올바른 컨벤션은 이미 코드베이스에 존재했지만 어디에도 문서화되지 않았고, 계획 문서(설치된 라이브러리 버전을 확인하지 않고 작성됨)의 테스트 코드 예시에도 반영되지 않았다. 그 결과 새 테스트 파일을 작성하는 태스크마다 매번 처음부터 같은 실패를 겪고 같은 수정을 반복했다 — 개별 태스크 내에서의 즉석 발견은 다음 태스크로 전파되지 않는다는 것이 반복 그 자체로 드러난 교훈이다.

## Solution

`@testing-library/react-native`의 `render(...)`, `renderHook(...)`, `act(...)` 호출 앞에 항상 `await`를 붙인다.

Before:

```tsx
const view = render(<Component />);
expect(view.getByText('Hello')).toBeTruthy();

const { result } = renderHook(() => useSomething());
act(() => { result.current.doThing(); });
```

After:

```tsx
const view = await render(<Component />);
expect(view.getByText('Hello')).toBeTruthy();

const { result } = await renderHook(() => useSomething());
await act(() => { result.current.doThing(); });
```

이 저장소에서 실제로 이 패턴이 적용된 곳: `mobile/__tests__/CalendarScreen.test.tsx`(`await render(<CalendarRoute />)`), `mobile/__tests__/useDailyDetail.test.ts`(`await renderHook(...)`, `await act(...)`), `mobile/__tests__/DailyDetailScreen.test.tsx`(`await render(...)` + `await fireEvent.press(...)`), `mobile/__tests__/CheckInRoute.test.tsx`(동일 패턴).

## Why This Works

설치된 `@testing-library/react-native@14.0.1`(RNTL v13+ 계열)에서 `render`, `renderHook`, `act`는 결과를 동기적으로 반환하지 않고 Promise를 반환하는 비동기 함수다. `await` 없이 `render(...)`의 반환값에 `.getByText(...)` 같은 메서드를 호출하면 그 호출 대상은 `Promise` 객체이므로 해당 메서드가 존재하지 않아 "is not a function" 에러가 난다. `await`로 resolve하면 실제 `RenderResult`/`RenderHookResult`가 되어 쿼리·상호작용 메서드가 정상 동작한다. `act`도 마찬가지로, `await` 없이는 RNTL이 업데이트를 flush하기 전에 다음 코드가 실행될 수 있어 타이밍 버그로 이어진다.

## Prevention

- 이 문서 자체가 1차 방지책이다 — 새 서브에이전트가 같은 실수를 반복하기 전에 검색으로 찾을 수 있게 한다.
- `superpowers:writing-plans`(또는 향후 계획 수립 단계)가 이 저장소의 React Native 테스트 코드 예시를 생성할 때는, 먼저 `mobile/package.json`에 고정된 `@testing-library/react-native` 메이저 버전을 확인하고, `render`/`renderHook`/`act` 예시 코드에 기본적으로 `await`를 붙이도록 한다. 계획 문서 자체가 틀린 가정을 다시 심지 않게 막는 것이 가장 효과적인 지점이다.
- 선택적 보강: `mobile/eslint.config.js`에는 현재 `testing-library` 전용 ESLint 플러그인이 설정되어 있지 않다(확인됨). `eslint-plugin-testing-library`의 `await-async-events`/`await-async-utils` 규칙을 도입하면 `await` 누락을 린트 단계에서 기계적으로 잡아낼 수 있다 — 컨벤션 문서만으로 충분하지 않다고 판단되면 후속 작업으로 검토한다.

## Related Issues

`docs/solutions/`에서 검색했으나 낮은 연관성(태그상 `testing_framework` component만 일치)의 문서 두 건 외에 직접 관련된 기존 문서는 없었다: `docs/solutions/integration-issues/expo-router-notification-lifecycle-qa.md`(Expo Router·알림 수명주기 QA, RNTL과 무관), `docs/solutions/build-errors/spring-boot-4-jackson3-testresttemplate-removed.md`(백엔드 Spring Boot 테스트 이슈, 플랫폼이 다름). GitHub 이슈 검색 결과도 없었다.
