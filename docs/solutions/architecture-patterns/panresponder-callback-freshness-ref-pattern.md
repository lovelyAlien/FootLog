---
title: "PanResponder 핸들러가 마운트 시점 콜백을 영구 고정 캡처하는 문제"
date: 2026-08-19
category: architecture-patterns
module: mobile/src/features/notifications
problem_type: architecture_pattern
component: tooling
severity: medium
related_components:
  - testing_framework
applies_when:
  - "커스텀 React Native 제스처 응답 컴포넌트(PanResponder 등, 한 번만 생성되는 핸들러 객체)를 만들 때 그 핸들러가 부모가 넘긴 콜백 prop을 다시 호출해야 하는 경우"
  - "응답 객체를 useState(() => create(...)) 또는 useRef(create(...)).current 같은 마운트 시점 전용 초기화로 생성하는 경우(렌더마다 다시 만들지 않는 경우)"
  - "그 컴포넌트가 받는 콜백 prop(onChangeEnd 등)을 호출부가 매 렌더마다 새 인라인 함수로 넘길 수 있는 경우"
  - "렌더를 거듭해도 제스처 기반 콜백이 최신 상태를 유지하는지 증명하는 회귀 테스트를 작성할 때"
tags:
  - react-native
  - panresponder
  - stale-closure
  - useref
  - gesture-responder
  - custom-slider
---

# PanResponder 핸들러가 마운트 시점 콜백을 영구 고정 캡처하는 문제

## Context

`ActivityWindowSlider`(`mobile/src/features/notifications/ActivityWindowSlider.tsx`)는 React Native의 `PanResponder` API 위에 직접 만든 듀얼 핸들 드래그 슬라이더로, `NotificationSettingsScreen`(`mobile/src/features/notifications/NotificationSettingsScreen.tsx`)이 체크인 알림의 활동 시간대(시작/종료 시각)를 설정할 때 사용한다. 드래그가 끝나면 슬라이더는 호출부가 넘긴 `onChangeEnd` prop을 새 값과 함께 호출해서, 화면이 그 값을 저장하고 알림을 다시 예약하도록 해야 한다(`NotificationSettingsScreen.tsx:183-188`, `applyChange`는 `NotificationSettingsScreen.tsx:69-100`).

이 컴포넌트는 핸들(시작/종료)마다 하나씩, 총 두 개의 `PanResponder` 인스턴스를 `useState(() => createResponder(handle))`(`ActivityWindowSlider.tsx:92,94`)로 생성한다 — `PanResponder.create({...})`는 컴포넌트 생명주기 동안 핸들당 한 번만 만들면 되기 때문이다. `createResponder`가 만드는 `onPanResponderRelease` 핸들러(`ActivityWindowSlider.tsx:78-82`)는 최종 값을 알리기 위해 내부 `emitChange` 함수를 호출한다. (최초 구현이 아니라) 최종 전체 브랜치 리뷰 단계에서, 드래그 릴리즈가 **오래된(stale)** 버전의 콜백으로 `onChangeEnd`를 호출할 수 있다는 사실이 드러났다 — 그 콜백 자체가 처음 생성될 때 화면의 `intervalHours` 같은 바깥 상태를 오래된 채로 캡처했을 수 있다는 뜻이다. `ActivityWindowSlider`에 매 렌더마다 새로 넘어온 `onChangeEnd` prop 자체는 항상 최신이었는데도 그랬다. 증상은 조용했다 — 크래시도, 경고도 없이, 사용자가 설정을 바꾼 뒤 슬라이더를 드래그하면 스케줄러가 오래된 간격/시간대 값으로 호출될 뿐이었다.

## Guidance

**`useState(() => ...)` / `useRef(fn()).current`로 한 번만 생성되는 객체(PanResponder 등)의 제스처 핸들러가, 렌더마다 바뀌는 prop이나 바깥 변수를 직접 클로저로 캡처하게 두면 안 된다.** `useState`/`useRef`에 넘긴 초기화 함수는 마운트 시점에 딱 한 번만 실행되고 이후 렌더에서는 절대 다시 호출되지 않는다 — 그래서 그 안에서 (ref로 호출 시점에 읽는 게 아니라) 값으로 캡처된 것은, 컴포넌트가 아무리 여러 번 리렌더되고 prop이 아무리 여러 번 바뀌어도 컴포넌트 생명주기 내내 그 값 그대로 고정된다.

해결책은 프리즌 핸들러가 필요로 하는 모든 값을 ref로 우회시키고, 그 ref를 **의존성 배열이 없는 `useEffect`**(매 렌더 후 실행, deps 없음) 안에서 최신 상태로 유지하는 것이다 — 한 번만 실행되는 초기화 함수 안이 아니라. `ActivityWindowSlider.tsx`에는 이미 `startHour`/`endHour`/`trackWidth`/`disabled`에 대해 이 패턴이 적용돼 있었다(`ActivityWindowSlider.tsx:29-42`). 수정은 같은 패턴을 `onChangeEnd`까지 확장하는 것이었다:

```ts
// ActivityWindowSlider.tsx:29-42
const startHourRef = useRef(startHour);
const endHourRef = useRef(endHour);
const trackWidthRef = useRef(trackWidth);
const disabledRef = useRef(disabled);
const dragRef = useRef<DragState | null>(null);
const onChangeEndRef = useRef(onChangeEnd);   // 추가

useEffect(() => {
  startHourRef.current = startHour;
  endHourRef.current = endHour;
  trackWidthRef.current = trackWidth;
  disabledRef.current = disabled;
  onChangeEndRef.current = onChangeEnd;         // 추가, deps 배열 없음 -> 매 렌더마다 실행
});

// ActivityWindowSlider.tsx:48-54
const emitChange = useCallback((handle: Handle, hour: number) => {
  onChangeEndRef.current(                       // 생성 시점이 아니라 호출 시점에 ref를 읽음
    handle === 'start'
      ? { startHour: hour, endHour: endHourRef.current }
      : { startHour: startHourRef.current, endHour: hour },
  );
}, []);   // 영구히 안정적 — 안에서 바뀌는 값을 직접 클로저로 잡는 게 없으므로 안전
```

`PanResponder` 인스턴스 자체는 여전히 한 번만 생성된다(`ActivityWindowSlider.tsx:92,94`, `useState(() => createResponder(handle))`) — 이 부분은 바꿀 필요가 없다. 바뀌는 것은 그 안에 연결된 핸들러(`onPanResponderRelease`, `ActivityWindowSlider.tsx:78-82`, `emitChange`를 호출)가 이제 호출되는 순간에만 ref를 역참조한다는 점이다. 그래서 그 핸들러들을 연결한 `PanResponder` 객체가 마운트 시점에 고정된 채로 남아 있어도 상관없다.

**반례(버그의 모양):** `emitChange`가 `onChangeEndRef.current` 대신 `onChangeEnd`를 직접 클로저로 캡처했다면 —

```ts
// 잘못된 예 — 이 클로저가 생성된 순간의 onChangeEnd를 캡처함
const emitChange = useCallback((handle: Handle, hour: number) => {
  onChangeEnd(/* ... */);
}, [onChangeEnd]);
```

— 이건 얼핏 맞는 것처럼 보인다. `[onChangeEnd]`를 deps로 둔 `useCallback`은 `onChangeEnd`가 바뀔 때마다 실제로 새 `emitChange` 함수를 만들어내기 때문이다. 하지만 그건 도움이 안 된다: `emitChange`를 `onPanResponderRelease`에 연결한 `PanResponder`는 `useState(() => createResponder(handle))`로 한 번만 만들어졌고 **절대 다시 만들어지지 않는다** — 그래서 그 `onPanResponderRelease` 핸들러는, 이후 아무리 많은 새 `emitChange` 값이 만들어져도, 최초 렌더 시점에 존재했던 `emitChange`(그리고 그 시점의 `onChangeEnd`)를 계속 호출한다.

**이 수정으로 호출부가 지울 수 있게 된 것.** 이 수정이 컴포넌트 내부에 존재하기 전에는, `NotificationSettingsScreen`이 바깥에서 이 버그를 우회해야 했다 — 평범한 인라인 함수 대신, 자체적으로 ref로 뒷받침된 안정적인 래퍼 콜백을 넘기는 식으로. `ActivityWindowSlider`가 내부적으로 항상 *최신* `onChangeEnd`를 호출하도록 보장하게 된 지금은, 화면 쪽에 그런 배관이 전혀 필요 없다. 현재 수정된 화면은 그냥 매 렌더마다 새 인라인 화살표 함수를 넘긴다(`NotificationSettingsScreen.tsx:183-188`):

```ts
<ActivityWindowSlider
  startHour={startHour}
  endHour={endHour}
  disabled={isBusy}
  onChangeEnd={(nextWindow) => { void applyChange(nextWindow, intervalHours); }}
/>
```

이게 제대로 동작하는 이유는 — 드래그 릴리즈마다 최신 `intervalHours`를 정확히 반영하는 것까지 포함해서 — 컴포넌트가 더 이상 자신이 받는 참조가 안정적인지 신경 쓰지 않기 때문이다. **경험칙: "항상 최신이어야 한다"는 책임은 그 프리즌 제스처 핸들러를 소유한 컴포넌트 쪽으로 밀어넣어야지, 그 컴포넌트를 호출하는 모든 쪽에 떠넘기면 안 된다.** 호출부가 자식 컴포넌트를 우회하려고 직접 ref 기반의 안정적인 콜백을 손으로 만들어야 한다면, 그건 버그가 자식 쪽에 있다는 신호다.

## Why This Matters

이 종류의 버그가 위험한 이유는 두 가지가 겹치기 때문이다.

1. **조용하다.** 에러도, 린트 경고도, 런타임 경고도 없다. RN의 `PanResponder` API는 핸들러가 오래됐다는 신호를 전혀 주지 않는다. 컴포넌트는 계속 정상적으로 렌더링되고, UI도 멀쩡해 보이며, 유일한 증상은 "충분히" 여러 번 렌더가 일어난 뒤(정확히는: 핸들러가 의존하는 prop/state가 바뀐 렌더가 한 번이라도 있은 뒤) 콜백이 잘못된 데이터로 호출된다는 것뿐이다. 그래서 그대로 배포되기 쉽고, 가벼운 수동 테스트로는 놓치기 쉽다 — 마운트 직후 첫 드래그(아직 아무것도 안 바뀐 상태)는 정상 동작하고, 다른 상태가 바뀐 *이후*의 드래그에서만 문제가 드러나기 때문이다.

2. **일반적으로 오래된 값을 막아주는 도구들이 여기서는 도움이 안 되기 때문에 만들기 쉽다.** 올바른 의존성 배열을 가진 `useCallback`이나, 최신 prop을 캡처하는 `useState` setter는 항상 최신 상태를 유지해줄 것처럼 *보인다* — 실제로 다른 모든 곳에서는 정확히 그렇게 동작한다. 이 실패 모드는 그런 값이 **`useState(() => ...)` / `useRef(fn()).current`라는 한 번뿐인 초기화 경계 안에서 소비될 때만** 나타난다. 그 경계는 팩토리 함수를 정확히 한 번만 실행하고 그 안의 어떤 것도 다시 들여다보지 않기 때문이다. 이 경계의 존재를 잊기 쉬운데, 특히 소비되는 값(여기선 `emitChange`) 자체는 `useCallback`으로 올바르게 최신 상태를 유지하고 있을 때 더 그렇다 — 오래됨이 한 단계 떨어진 곳, 즉 최신 값을 "연결하는" 객체 쪽에 있지, 최신 값 그 자체에 있지 않기 때문이다.

**테스트의 함정.** 이 버그의 회귀 테스트는 실제로는 회귀를 잡을 수 없는 것을 테스트하면서도 마치 버그 경로를 검증하는 것처럼 보일 수 있다. 이 버그의 첫 번째 테스트 시도는 `ActivityWindowSlider`의 VoiceOver/접근성 경로를 통해 상호작용을 일으켰다 — `fireEvent(handle, 'accessibilityAction', {...})`로 `onAccessibilityAdjust`(`ActivityWindowSlider.tsx:99-105`)를 실행시킨 것이다. 그 함수는 매 렌더마다 새로 정의되고, `startHour`/`endHour`를 ref가 아니라 prop/state에서 직접 읽으며, `PanResponder`를 아예 건드리지 않는다 — 그래서 애초에 이 고정(freeze) 문제의 영향을 받지 않는다. 이런 테스트는 `onChangeEndRef` 수정이 있든 되돌려지든 똑같이 통과해서 거짓 확신을 준다.

수정된 회귀 테스트(`mobile/__tests__/NotificationSettingsScreen.test.tsx:111-147`)는 대신 렌더된 핸들의 props에서 컴포넌트의 실제 고정된 `PanResponder` 핸들러를 직접 캡처한다 — `endThumb.props.onResponderGrant` / `endThumb.props.onResponderRelease`(`NotificationSettingsScreen.test.tsx:127-128`) — 최초 마운트 직후, 오래됨을 증명하는 데 중요한 상태 변화가 일어나기 전에. 그런 다음 실제 버그가 의존했던 상태를 바꾸고(프리셋 버튼으로 간격을 전환, `NotificationSettingsScreen.test.tsx:130`), 손으로 만든 최소한의 합성 `touchHistory` 객체를 넘겨(`NotificationSettingsScreen.test.tsx:133-140`) 캡처해둔 마운트 시점 핸들러를 직접 호출한다. 여기서 실제로 호출하는 `onResponderGrant`/`onResponderRelease` 경로에서 RN의 `PanResponder` 내부가 제스처 중심점을 계산하기 위해 읽는 건 `touchHistory.touchBank`, `numberActiveTouches`, `indexOfSingleActiveTouch`뿐이므로(다른 핸들러인 `onResponderMove` 등에서만 읽는 `mostRecentTimeStamp`는 이 경로에서는 쓰이지 않는다), 이 필드들만 채운 최소한의 객체로도 실제 제스처 시뮬레이션 없이 핸들러를 구동하기에 충분하다. 이 테스트는 버그가 있는 코드(오래된 간격)에서는 실패하고 수정된 코드에서는 통과한다 — 버그가 실제로 살아 있던 그 고정된 클로저를 정확히 건드리기 때문이다.

**이런 종류의 버그를 테스트할 때의 일반 원칙:** 컴포넌트가 한 번만 생성되는 저수준 핸들러 객체(`PanResponder`, 또는 비슷하게 `useRef`로 캐시된 이벤트 리스너, `IntersectionObserver` 등)를 감싸고 있다면, 회귀 테스트는 관련 상태 변화가 일어난 뒤 반드시 *바로 그 고정된 핸들러 인스턴스*를 호출해야 한다 — 겉보기에 비슷한 사용자 가시적 결과를 만들어내지만 실제로는 고정되지 않은 다른 상호작용 경로를 대신 쓰면 안 된다. 만약 컴포넌트가 같은 사용자 가시적 결과를 만드는 독립적인 경로를 두 개 제공한다면(여기서는 드래그 vs 접근성 조정), 테스트가 실제로 의심 대상 코드를 통과하는 경로를 쓰는지 먼저 확인해야 한다.

## When to Apply

다음 조건을 만족하는 React Native(또는 React) 컴포넌트를 만들 때 이 패턴을 적용한다.

- `useState(() => ...)` 또는 `useRef(fn()).current`로 제스처/이벤트 핸들러 객체를 한 번만 생성한다 — 가장 흔한 경우는 `PanResponder.create({...})`지만, 한 번뿐인 팩토리로 만들어져 오래 유지되는 다른 명령형 API 객체(`IntersectionObserver`, 마운트 시점에 한 번 설정하는 WebSocket 핸들러, 네이티브 이벤트 이미터 구독 등)에도 똑같이 적용된다.
- 그 핸들러 객체의 콜백이 호출부가 넘긴 prop(`onChangeEnd`, `onDragEnd`, `onScroll` 등)을 호출하거나 바깥 컴포넌트의 state/prop을 읽어야 한다.

이런 컴포넌트를 작성하거나 리뷰할 때 체크리스트:

1. 한 번뿐인 초기화 함수의 클로저 안(직접적이든, 그 초기화 함수가 연결한 `useCallback` 메모이즈 헬퍼를 거쳐 간접적이든) 어디에서 참조되는 모든 prop/state 값을 찾아낸다.
2. 각각에 대해, 값으로 캡처되거나 의존성 배열이 있는 `useCallback`으로 캡처된 게 아니라 호출 시점에 `ref.current`로 읽히는지 확인한다.
3. 그 ref들이 의존성 배열이 없는 `useEffect`(`[]`도 아니고 deps 배열 자체가 없어야 함 — 매 렌더 후 실행)로 최신 상태를 유지하는지 확인한다.
4. 고정된 객체에서 실제 핸들러를 캡처해서 관련 상태 변화 이후에 호출하는 회귀 테스트가 있는지(또는 작성했는지) 확인한다 — 고정된 객체를 완전히 우회할 수 있는 다른 상호작용 경로가 아니라.

## Examples

**이전(버그의 형태, 실제로 배포된 코드는 아님 — 설명용):**
```ts
const emitChange = useCallback((handle: Handle, hour: number) => {
  onChangeEnd(/* 바깥 스코프의 startHour / endHour를 직접 사용 */);
}, [onChangeEnd, startHour, endHour]);

const [startResponder] = useState(() => PanResponder.create({
  onPanResponderRelease: () => {
    if (dragRef.current) emitChange(dragRef.current.handle, dragRef.current.hour);
  },
  // ...
}));
```
얼핏 맞아 보인다(`useCallback` deps에 쓰이는 모든 것이 들어 있다). 하지만 `onPanResponderRelease`는 `useState(() => ...)`의 최초 렌더 시점에 존재했던 `emitChange`에 연결됐고, 이후 다시 연결되지 않는다.

**이후(실제 배포된 수정, `ActivityWindowSlider.tsx:29-54`):**
```ts
const startHourRef = useRef(startHour);
const endHourRef = useRef(endHour);
const onChangeEndRef = useRef(onChangeEnd);

useEffect(() => {
  startHourRef.current = startHour;
  endHourRef.current = endHour;
  onChangeEndRef.current = onChangeEnd;
});

const emitChange = useCallback((handle: Handle, hour: number) => {
  onChangeEndRef.current(
    handle === 'start'
      ? { startHour: hour, endHour: endHourRef.current }
      : { startHour: startHourRef.current, endHour: hour },
  );
}, []); // 안정적인 identity — 모든 것을 호출 시점에 ref로 읽으므로 안전
```

**실제로 고정된 경로를 검증하는 회귀 테스트**(`mobile/__tests__/NotificationSettingsScreen.test.tsx:111-147`, 축약):
```ts
const endThumb = view.getByLabelText('종료 시간');
const { onResponderGrant, onResponderRelease } = endThumb.props; // 마운트 시점에 캡처, 고정됨

await act(async () => { fireEvent.press(view.getByRole('button', { name: '2시간 간격' })); });
// ^ 마운트 시점 핸들러를 캡처한 "뒤에" 버그가 의존했던 상태(간격)를 바꾼다

const touchHistory = {
  touchBank: [{ touchActive: true, currentTimeStamp: 1, currentPageX: 100, currentPageY: 0, previousPageX: 100, previousPageY: 0 }],
  numberActiveTouches: 1,
  indexOfSingleActiveTouch: 0,
  mostRecentTimeStamp: 1,
};
await act(async () => {
  onResponderGrant({ touchHistory, nativeEvent: {} });
  onResponderRelease({ touchHistory, nativeEvent: {} });
});

expect(dependencies.scheduler.reschedule).toHaveBeenCalledWith({ startHour: 7, endHour: 23 }, 2);
```
`NotificationSettingsScreen.test.tsx:99-109`에 있는, 회귀를 잡지 못하는 접근성 경로 테스트와 대조된다 — 그 테스트는 `onAccessibilityAdjust`를 실행시키는데, 이 함수는 매 렌더마다 새로 정의되고 `PanResponder`를 전혀 건드리지 않으므로, `onChangeEndRef` 수정이 있든 없든 항상 통과한다.

## Related

- 이 저장소의 `docs/solutions/` 안에서는 겹치는 기존 문서를 찾지 못했다(가장 근접한 후보는 `docs/solutions/test-failures/rntl-v14-render-async-requires-await.md`이지만, 겹치는 부분은 "React Native 모바일 앱의 테스트 파일"이라는 플랫폼/태그 수준뿐이고 문제·원인·해결책은 전혀 다르다). 이 저장소에 PanResponder/제스처 관련 선례가 생긴 것은 이번이 처음이다.
