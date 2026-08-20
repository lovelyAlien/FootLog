---
title: "'오늘 날짜'에 의존하는 테스트를 고칠 때, 고치는 방식 자체가 같은 종류의 취약성을 재도입할 수 있다"
date: 2026-08-20
category: test-failures
module: "mobile/__tests__/CalendarScreen.test.tsx"
problem_type: test_failure
component: testing_framework
symptoms:
  - "특정 날짜(매달 1일)에 테스트를 실행하면 unhandled/timeout 형태로 실패하지만, 다른 날에는 항상 통과함"
  - "1차 수정 후에도 여전히 매달 특정 날짜들(하루의 자릿수가 1자리인 날, 총 12/31일)에서 실패할 수 있는 상태로 남음"
  - "실패가 리뷰 시점의 실제 시스템 날짜에 좌우돼, 코드 리뷰만으로는 재현·검증이 어려움"
root_cause: test_isolation
resolution_type: test_fix
related_components:
  - development_workflow
tags:
  - date-dependent-flakiness
  - regex-anchoring
  - jest
  - react-native-testing-library
  - calendar
  - code-review
---

# '오늘 날짜'에 의존하는 테스트를 고칠 때, 고치는 방식 자체가 같은 종류의 취약성을 재도입할 수 있다

## Problem

캘린더 날짜 미리보기 패널(`mobile/app/(tabs)/calendar.tsx`)의 테스트 중 하나가, 화면이 진입 시 오늘 날짜를 기본 선택하는 동작과 "1일" 셀을 탭하는 하드코딩된 동작이 겹쳐서, 실제 시스템 날짜가 매달 1일일 때만 실패하는 잠재적 결함을 갖고 있었다. 이 결함을 고치는 **첫 번째 시도** 자체가, 다른 메커니즘(정규식 모호성)으로 같은 종류의 날짜 의존 취약성을 다시 만들어냈다 — 두 번째 리뷰 라운드에서야 잡혔다.

## Symptoms

- `mobile/__tests__/CalendarScreen.test.tsx`의 `'shows an inline preview error without breaking the grid when a manually selected date fails to load'` 테스트가 `view.getByRole('button', { name: / 1일$/ })`로 "1일" 셀을 항상 탭했다.
- 화면(`calendar.tsx`)은 진입 시 보고 있는 달에 오늘이 포함되면 오늘 날짜를 기본 선택한다. 오늘이 1일인 경우, "1일" 탭은 이미 선택된 날짜를 동일한 값으로 다시 `setSelectedDate`하는 셈이 되어 React가 변경 없는 프리미티브 값에 대해 렌더를 bail-out하고, 그 결과 해당 selectedDate에 연결된 fetch effect가 재실행되지 않는다.
- 이 effect에 준비해 둔 `mockRejectedValueOnce(...)`(고의로 실패하도록 큐에 넣은 두 번째 응답)가 결코 소비되지 않아, `waitFor(() => getByText('불러오지 못했어요.'))`가 타임아웃으로 실패한다.
- 세션 당일(2026-08-20)은 20일이라 이 결함이 실제로 발현되지 않았고, 코드 리뷰만으로는 날짜에 좌우되는 실패를 재현하기 어려웠다.

## What Didn't Work

**1차 수정**: 테스트 안에서 `otherDay = (todayDay % 28) + 1`을 계산해, 오늘과 항상 다른 날짜를 탭하도록 바꿨다. 그리고 그 날짜를 `new RegExp(\`${otherDay}일$\`)`(앞에 공백 없이)로 찾아 눌렀다.

이 산술 자체(`otherDay ≠ todayDay`가 1~31 전 범위에서 성립하는지)는 리뷰에서 검증돼 맞았다. 하지만 **그 값을 찾는 쿼리**가 새로운 문제였다. 캘린더 셀의 접근성 이름은 `${year}년 ${month}월 ${day}일` 형태이고 `day`는 0-패딩 없는 숫자다. `otherDay`가 한 자리 숫자(1~8, 그리고 28~31에서 계산된 1~4)일 때, 앞에 공백 없는 정규식 `${otherDay}일$`은 그 숫자로 끝나는 다른 날짜 라벨과도 매칭된다 — 예를 들어 `otherDay=2`면 "8월 2일"뿐 아니라 "8월 12일", "8월 22일"과도 매칭돼, `getByRole`이 "여러 개 일치" 오류로 즉시 실패한다. 이 충돌은 `todayDay`가 `{1,2,3,4,5,6,7,8,28,29,30,31}`일 때, 즉 31일 중 약 39%에서 확정적으로 발생한다 — "1일 문제"를 고치려다 "다른 여러 날짜에 문제 있는" 상태로 표면적만 바뀐 것이다.

이 1차 수정은 리뷰 1라운드를 통과했다 — 리뷰어가 산술의 정확성만 확인하고, 그 값을 실제로 화면에서 찾는 쿼리의 모호성까지는 처음에 다시 파고들지 않았기 때문이다.

## Solution

**2차 수정**: 정규식에 앞 공백을 추가했다.

```ts
// mobile/__tests__/CalendarScreen.test.tsx:71 (다른 두 테스트도 동일 패턴, 60-71·147-157·179-192)
const [, , todayDayString] = today.split('-');
const todayDay = Number(todayDayString);
const otherDay = (todayDay % 28) + 1; // always in every month, always different from todayDay
// ...
await fireEvent.press(view.getByRole('button', { name: new RegExp(` ${otherDay}일$`) }));
```

`날짜 라벨(${year}년 ${month}월 ${day}일`)에서 한 자리 숫자 날짜 앞에는 항상 공백이 오고, 두 자리 숫자(예: "12", "22")의 앞자리는 공백이 아니라 다른 숫자다. 앞 공백을 요구하면 "…12일"이나 "…22일"의 끝부분이 우연히 "2일"과 매칭되는 경우가 구조적으로 차단된다.

## Why This Works

두 자리 최대값이 31인 달력 셀 구조에서, ` ${otherDay}일$` 같은 "공백+숫자+일+문자열 끝" 패턴은 정확히 하나의 셀만 매칭한다 — 앞 공백이 두 자리 숫자의 앞자리 숫자와는 절대 일치할 수 없기 때문이다(공백은 숫자가 아니다). `otherDay`는 항상 1~28 범위(모든 달이 최소 28일을 가지므로 항상 렌더링됨)이고 `todayDay`와 절대 같지 않도록 계산됐으므로, 이 조합은 `todayDay`가 1~31 어떤 값이어도 모호함 없이 정확히 의도한 날짜 셀 하나만 가리킨다.

## Prevention

- **날짜/숫자 기반 UI 텍스트를 정규식으로 찾을 때는, 그 숫자가 다른 요소의 라벨에 부분 문자열로 나타날 수 있는지부터 검토한다.** 캘린더처럼 1~31이 모두 화면에 동시에 존재하는 UI에서는 한 자리 숫자가 두 자리 숫자의 접미사로 등장하는 충돌이 항상 가능하다 — 경계 문자(공백, 단어 경계, 전체 문자열 일치)로 반드시 앵커링한다.
- **"오늘 날짜"에 의존하는 테스트 값을 고칠 때는, 그 값이 유효한 전체 범위(예: 1~31일)에 대해 성립하는지 직접 순회하며 확인한다** — 오늘 하루치 값만 맞는지 확인하고 넘어가지 않는다. 이 세션에서는 리뷰어가 "`todayDay` 1~31 전체에 대해 `otherDay` 산술이 성립하는가"뿐 아니라 "그 `otherDay`를 찾는 쿼리가 같은 전체 범위에서 모호하지 않은가"까지 별도로 재유도(re-derive)하고 나서야 이 결함을 잡아냈다 — 첫 번째 속성이 참인 것과 두 번째 속성이 참인 것은 서로 다른 주장이며, 둘 다 확인해야 한다.
- **날짜 의존 테스트를 고친 뒤에는, 문제가 되는 날짜를 시스템 시계를 흉내 내서라도 직접 재현해 통과/실패를 확인하는 것이 이상적이다.** 이 세션에서는 시간 제약상 코드를 읽고 수동으로 추론하는 방식으로 검증했는데, `otherDay`가 한 자리가 되는 날짜 하나를 골라 이전(공백 없는) 정규식으로는 실패하고 이후(공백 있는) 정규식으로는 통과하는지 직접 실행해 확인했다면 이 결함은 1차 수정 단계에서 이미 걸러졌을 것이다.
- 코드 예시 — 앵커링 규칙을 재사용할 때 참고할 최소 형태:

  ```ts
  // 나쁨: 두 자리 숫자의 접미사와 충돌 가능
  new RegExp(`${n}일$`)

  // 좋음: 앞 공백으로 앵커링해 모호함을 구조적으로 차단
  new RegExp(` ${n}일$`)
  ```
