---
title: "iOS 스와이프-뒤로가기 제스처가 화면 가장자리 근처 PanResponder 드래그를 가로챔"
date: 2026-08-19
category: ui-bugs
module: mobile/app (expo-router 내비게이션), mobile/src/features/notifications/ActivityWindowSlider.tsx
problem_type: ui_bug
component: tooling
symptoms:
  - "체크인 알림 화면에서 활동 시간대 슬라이더의 왼쪽(시작 시간) 핸들을 드래그하면 슬라이더가 반응하지 않고 화면이 바로 이전 화면으로 튕겨나감"
  - "출근형(07:00)·아침형(05:00)처럼 시작 시간이 이른 프리셋에서 재현됨 — 왼쪽 핸들이 화면 왼쪽 가장자리에서 약 44pt 정도로 가까움"
  - "React Native Testing Library 단위 테스트에서는 전혀 드러나지 않고, iOS 시뮬레이터에서 손가락으로 직접 드래그해야만 재현됨"
root_cause: config_error
resolution_type: config_change
severity: medium
related_components:
  - development_workflow
tags:
  - react-native
  - expo-router
  - ios
  - gesture-conflict
  - panresponder
  - swipe-back
  - navigation
---

# iOS 스와이프-뒤로가기 제스처가 화면 가장자리 근처 PanResponder 드래그를 가로챔

## Problem

`NotificationSettingsScreen`(`mobile/app/settings/reminders.tsx`)의 활동 시간대 듀얼 핸들 슬라이더(`ActivityWindowSlider.tsx`, React Native `PanResponder` 기반)에서, 시작 시간이 이른 값(예: "출근형" 프리셋의 07:00, "아침형"의 05:00)일 때 왼쪽 핸들을 드래그하면 iOS의 화면 가장자리 스와이프-뒤로가기 제스처가 그 드래그를 슬라이더보다 먼저 가로채서, 사용자가 슬라이더를 조작하려던 순간 화면이 이전 화면(오늘 탭)으로 튕겨나갔다.

## Symptoms

- 활동 시간대 슬라이더의 왼쪽 핸들을 손가락으로 드래그하면 슬라이더 값이 바뀌지 않고 화면이 즉시 이전 화면으로 내비게이션됨.
- 두 번 연속으로 동일하게 재현됨(iOS 시뮬레이터, iPhone 17 Pro).
- `mobile/__tests__/ActivityWindowSlider.test.tsx`, `mobile/__tests__/NotificationSettingsScreen.test.tsx`의 자동 테스트는 전부 통과 상태였음 — RNTL(`@testing-library/react-native`)은 실제 터치 이벤트를 iOS 제스처 인식기와 경쟁시키는 저수준 제스처 중재를 시뮬레이션하지 않기 때문에, 이 문제는 자동 테스트로는 원천적으로 드러나지 않는다.

## What Didn't Work

이 문제 자체를 회피하려는 시도는 없었다 — 슬라이더의 `PanResponder` 로직(`ActivityWindowSlider.tsx`)은 이미 정상 동작했고, 문제는 슬라이더 코드가 아니라 그 위에 얹힌 화면 수준의 내비게이션 제스처 설정에 있었다. 원인 파악은 iOS 시뮬레이터에서 실제 손가락 드래그(정확히는 시뮬레이터의 터치 경로 주입)로 왼쪽 핸들과 오른쪽 핸들을 각각 드래그해 비교하면서 이뤄졌다: 오른쪽(늦은 시각) 핸들 드래그는 정상 동작했고, 왼쪽 핸들만, 그것도 화면 가장자리에 가까운 값일 때만 실패했다 — 이 비대칭이 "슬라이더 자체의 버그가 아니라 화면 왼쪽 가장자리와 관련된 무언가"라는 단서가 됐다.

## Solution

이 화면(`settings/reminders`)에서만 React Navigation의 스와이프-뒤로가기 제스처를 끈다. 헤더에 이미 명시적인 "< 뒤로가기" 버튼이 있으므로(`mobile/app/_layout.tsx:148-150`, `title: '체크인 알림'`), 스와이프를 꺼도 뒤로 나가는 방법 자체는 그대로 남는다.

```tsx
// mobile/app/_layout.tsx:147-158
<Stack.Screen
  name="settings/reminders"
  options={{
    title: '체크인 알림',
    // The activity-window slider's left handle sits close to the screen edge for
    // early start hours (e.g. the 07:00 "출근형" preset), where iOS's edge
    // swipe-to-go-back gesture intercepts the drag before the slider's own
    // PanResponder sees it. The header already provides an explicit back button,
    // so disabling the swipe here loses no way to navigate back.
    gestureEnabled: false,
  }}
/>
```

`gestureEnabled: false`는 `expo-router`(React Navigation의 네이티브 스택 내비게이터)가 `Stack.Screen`의 `options`로 그대로 전달받는 표준 옵션이며, 그 화면으로 들어갈 때의 시스템 엣지 스와이프-뒤로가기 제스처만 끈다 — 다른 화면에는 영향이 없다.

수정 후 iOS 시뮬레이터에서 재검증: 왼쪽 핸들을 05:00에서 09:00으로 드래그해도 화면이 이탈하지 않고 슬라이더 값과 "하루 N회 알림" 요약이 정상적으로 갱신됐고, 헤더의 명시적 뒤로가기 버튼은 그대로 정상 동작했다.

## Why This Works

iOS는 내비게이션 스택에서 뒤로 갈 수 있는 화면이면, 화면 왼쪽 가장자리에서 시작해 오른쪽으로 스와이프하는 제스처를 시스템 차원에서 자동으로 붙여준다(React Navigation의 네이티브 스택이 이를 그대로 활용한다). 이 시스템 제스처의 터치 인식 영역은 화면 왼쪽 가장자리에서 상당히 넓게(단순한 몇 px가 아니라, 이 케이스에서는 최소 44pt 이상) 잡혀 있어서, 그 영역 안에서 시작하는 오른쪽 방향 드래그는 그 아래 앱이 자체 구현한 `PanResponder` 같은 제스처 응답자보다 시스템이 먼저 가로챌 수 있다. 활동 시간대 슬라이더의 왼쪽 핸들은 시작 시간이 이를수록(0시에 가까울수록) 화면 왼쪽 끝에 가까운 위치에 렌더링되므로, 그 범위 안에서는 사용자의 드래그 시작점이 시스템 제스처 인식 영역과 겹치게 된다.

`gestureEnabled: false`는 이 화면에 한해 그 시스템 제스처 자체를 등록하지 않게 만들어서, 같은 위치에서 시작하는 터치를 이제는 오직 앱의 `PanResponder`만 받게 된다. 근본 원인은 슬라이더의 드래그 처리 로직이 아니라 "이 화면이 시스템 스와이프-뒤로가기 제스처도 동시에 지원하고 있었다"는 내비게이션 설정 쪽에 있었으므로, 수정도 그 설정 쪽에서 이뤄지는 것이 맞다.

## Prevention

- **화면 가장자리 근처에 배치되는 커스텀 `PanResponder`/제스처 컴포넌트를 만들 때는, 그 컴포넌트가 실제로 화면 왼쪽 끝 가까이에 올 수 있는지(값의 범위, 반응형 레이아웃 등을 고려해서) 검토하고, 그렇다면 스택 내비게이션의 시스템 스와이프-뒤로가기 제스처와의 충돌 가능성을 명시적으로 검토한다.**
- **이런 종류의 충돌은 자동 테스트로 절대 잡히지 않는다 — 반드시 실제 기기/시뮬레이터에서 손가락(또는 시뮬레이터 터치 경로)으로 직접 드래그해서 확인하는 수동 QA 단계를 거쳐야 한다.** 특히 드래그 가능한 UI 요소가 화면 왼쪽(또는 RTL 레이아웃에서는 오른쪽) 가장자리 근처에 위치할 수 있는 화면은 우선순위를 두고 확인한다.
- 헤더에 명시적 뒤로가기 버튼이 있는 화면이라면, 특정 화면에서만 스와이프 제스처를 끄는 것(`gestureEnabled: false`)은 뒤로가기 자체를 막지 않으면서 충돌을 없애는 저비용 해결책이다 — 전역으로 끄지 말고 문제가 있는 화면에만 좁게 적용한다.
