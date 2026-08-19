---
title: "서드파티 UI 라이브러리 mock은 실제 런타임 invariant를 재현해야 함"
date: 2026-08-19
category: best-practices
module: "오늘 탭 지도/바텀시트 (@gorhom/bottom-sheet, BottomSheetFlatList, react-native-maps 모킹 전략)"
problem_type: best_practice
component: testing_framework
severity: critical
applies_when:
  - "서드파티 UI/네이티브 라이브러리(바텀시트, 가상화 리스트, 지도 등)를 유닛 테스트에서 얇은 mock으로 대체할 때"
  - "그 mock이 실제 라이브러리가 런타임에서만 강제하는 제약(마운트 시점 전용 prop, 가상화 기반 측정 실패 조건, 동적 사이징 계산 등)을 재현하지 않을 때"
  - "테스트 스위트는 전부 통과하지만 시뮬레이터/실기기에서 실행했을 때나 나중의 전체 브랜치 코드 리뷰에서만 문제가 드러나는 경우"
  - "라이브러리 자체 타입 정의(.d.ts)나 공식 문서에 '마운트 시에만 적용됨', '~조건이면 throw함' 같은 런타임 계약이 명시돼 있는 컴포넌트를 다룰 때"
symptoms:
  - "@gorhom/bottom-sheet를 얇은 View로 모킹해 enableDynamicSizing 기본값(true)이 빈 콘텐츠 상태에서 시트를 0 높이로 렌더링하는 실제 버그를 어떤 테스트도 잡지 못함 (수동 iOS 시뮬레이터 QA에서만 발견)"
  - "BottomSheetFlatList(VirtualizedList 기반) mock이 scrollToIndex를 bare jest.fn()으로만 스텁해, onScrollToIndexFailed 없이 initialNumToRender(기본 10)를 넘는 인덱스로 스크롤하면 실제로는 하드 invariant throw로 앱이 크래시하는데도 해당 컴포넌트의 테스트 6개가 모두 통과함"
  - "react-native-maps MapView mock이 initialRegion prop이 바뀔 때마다 그대로 재렌더링해, 실제 라이브러리는 마운트 이후 해당 prop 변경을 조용히 무시하는데도 '느린 GPS fix 이후 지도가 재중심된다'는 테스트가 그릇되게 통과함"
  - "세 결함 모두 최종 전체 브랜치 코드 리뷰(opus 리뷰어) 또는 수동 기기 QA에서만 발견됨 — 해당 코드를 정확히 커버한다고 여겨졌던 유닛 테스트 스위트는 구조적으로 잡을 수 없었음"
related_components:
  - "development_workflow"
  - "tooling"
tags:
  - "mocking"
  - "third-party-libraries"
  - "test-fidelity"
  - "gorhom-bottom-sheet"
  - "react-native-maps"
  - "virtualizedlist"
  - "runtime-invariants"
  - "code-review"
---

# 서드파티 UI 라이브러리 mock은 실제 런타임 invariant를 재현해야 함

## Context

"오늘" 탭(`mobile/src/features/check-in/TodayMapSheet.tsx`, 테스트 `mobile/__tests__/TodayMapSheet.test.tsx`)을 만들면서 화면이 서드파티 UI 라이브러리 세 개를 조합하게 됐다 — 바텀시트(`@gorhom/bottom-sheet`), 가상화 리스트(`BottomSheetFlatList`, React Native 코어 `VirtualizedList`의 래퍼), 지도(`react-native-maps`). 각각 유닛 테스트에서 목(mock)으로 대체했는데, 이는 React Native 네이티브 모듈에 대해서는 표준적인 관행이다 — 이 라이브러리들은 실기기/시뮬레이터 밖에서는 실행되지 않거나 Jest가 못 도는 네이티브 브릿지를 물고 있어서, 목을 안 쓰면 아예 테스트 격리가 불가능하다.

이 화면 하나를 구현하고 리뷰하는 과정에서 독립적인 결함이 라이브러리당 하나씩, 총 세 개가 나타났다. 원인은 서로 무관했지만 형태는 동일했다 — `TodayMapSheet.tsx`의 유닛 테스트 스위트는 전부 그린이었고, typecheck도 클린, lint도 클린이었는데, 실제 목 없는 컴포넌트는 프로덕션에서 세 가지 다른 방식으로 망가져 있었다(보이지 않는 UI 요소, 일상적인 상호작용에서의 크래시, 조용히 무시되는 prop 업데이트). 각 결함은 해당 코드를 커버한다고 여겨졌던 테스트가 아니라, 늦은 단계의 리뷰 — 수동 기기 QA이거나 최종 전체 브랜치 opus 코드 리뷰 — 에서만 걸렸다. 세 번 다 이런 식으로 반복됐다는 것이 이걸 하나의 실천 지침으로 문서화할 가치가 있게 만든다. 서로 무관한 버그 세 건을 각각 적는 것보다 낫다.

## Guidance

서드파티 라이브러리를 유닛 테스트에서 목으로 대체하기 전에, 그 라이브러리가 문서화한 런타임 invariant를 먼저 파악한다 — 공개 인터페이스 모양뿐 아니라, 실제 네이티브/브라우저 환경에서만 강제되는 동작 보증과 제약을 말한다. 이런 것들은 대개 라이브러리 자체의 `.d.ts` 파일이나 공식 문서에 구체적이고 찾기 쉬운 문구로 적혀 있다: "마운트 시에만 적용됨", "기본값은 X", "Y면 throw함", "Z가 설정돼야 함". 그 다음 목이 그 invariant와 관련된 동작을 재현하도록 만든다 — TypeScript를 통과시키거나 `useImperativeHandle`을 채우는 데 필요한 prop/메서드 이름만으로는 부족하다.

메서드 시그니처는 맞지만 런타임 동작은 아닌 목은, 특정한 의미에서 목이 아예 없는 것보다 나쁘다: 거짓 그린(false green)을 만들어낸다. 테스트는 목의 동작을 대상으로 검증하는데, 그 동작은 목 작성자가 우연히 구현한 것에 불과하다 — 보통은 "항상 성공한다", "새 prop으로 항상 다시 렌더링한다", "그냥 prop을 그대로 뿌린 View다" 같은 식이다. 실제 라이브러리의 동작이 특정 조건(기본 prop값, 측정 윈도우, 마운트 전용 생명주기 규칙)에서 그것과 어긋난다면, 그 목을 대상으로 아무리 테스트 케이스를 추가해도 그 어긋남에는 절대 도달하지 못한다 — 애초에 목의 코드 안에 그 어긋남 자체가 존재하지 않기 때문이다.

이 코드베이스에서 "런타임 invariant"는 구체적으로 세 가지 다른 것을 의미했다:
- **기본값 invariant**: `@gorhom/bottom-sheet`의 `enableDynamicSizing`은 기본값이 `true`이고, 조건부 자식 콘텐츠와 맞물려 시트를 0 높이로 만들 수 있다.
- **측정/가드 invariant**: `VirtualizedList`는 `initialNumToRender`만큼의 처음 항목만 측정하며, 등록된 폴백 없이 측정 안 된 인덱스로 `scrollToIndex`를 호출하면 하드 `invariant()`를 던진다.
- **생명주기 invariant**: `react-native-maps`의 `initialRegion` prop은 마운트 시에만 적용되고, 이후 prop 변경은 실제 컴포넌트가 조용히 무시한다.

이 중 어느 것도 특이한 게 아니다 — 라이브러리 자체 타입 정의나 doc comment에 직접 적혀 있는 종류의 동작이다 — 하지만 목의 인터페이스만 읽어서는 어느 것도 눈에 보이지 않고, "컴포넌트가 렌더되는가"나 "핸들러가 호출되는가" 같은 범용 테스트로도 드러나지 않는다.

세 사례는 각각 *다른* 검증 메커니즘으로 잡혔고, 그 다양성 자체가 교훈이다 — 세 개를 전부 잡아줄 단일한 검증 단계는 없었다.
- 사례 1(보이지 않는 UI)은 실제로 앱을 빌드해서 실제 iOS 시뮬레이터 화면을 눈으로 보는 것이 필요했다 — 어떤 테스트 assertion도, lint 규칙도, diff를 읽는 리뷰어도 조용한 0-높이 레이아웃을 만드는 기본 prop 누락을 잡을 수 없었다.
- 사례 2(11번째 이후 체크인에서 크래시)는 `VirtualizedList`의 내부 측정 윈도우 동작을 이미 알고 있는 리뷰어가, 기기 없이 diff만 읽으면서 필요했다 — 그 크래시는 테스트 환경에서도, 항목 10개 미만으로 하는 가벼운 수동 테스트에서도 절대 일어나지 않았다.
- 사례 3(GPS 재중심이 조용히 무시됨)은 두 번째의, 별도의 전체 브랜치 재검토가 필요했고, 애초에 사례 1을 고치는 과정에서 컴포넌트의 마운트 생명주기가 바뀌면서 새로 생겨난 결함이었다 — 첫 리뷰가 모든 걸 다 봤다고 가정하지 않고 누군가 브랜치 전체를 다시 리뷰했기 때문에만 잡힌 결함이다.

## Why This Matters

세 결함 모두 완전히 그린인 자동화 신호를 통과해서 나갔다 — 유닛 테스트 통과, typecheck 클린, lint 클린. 이 조합은 보통 변경이 안전하다는 충분한 증거로 취급된다. 여기서는 그렇지 않았다 — 한 사례는 프로덕션 결과가 완전히 쓸 수 없는, 보이지 않는 UI 요소였고, 다른 사례는 전혀 예외적이지 않은 일상적인 사용 패턴(이 앱의 시간별 체크인 모델은 하루에 체크인 10개를 넘기는 게 흔하므로, 11번째 핀 탭 크래시는 엣지 케이스가 아니라 그냥 화요일이었다)에서의 크래시였고, 세 번째는 아무 에러 없이 조용히 동작이 실패해서, 지도가 캐시된 위치로 이미 렌더된 뒤 느린 GPS fix를 일부러 기다려보지 않는 이상 주의 깊은 수동 테스트로도 놓치기 쉬웠다.

`VirtualizedList` 크래시를 잡아낸 opus 리뷰어의 말을 빌리면: "교훈은 '수동 QA를 더 하라'가 아니다. 런타임 invariant를 가진 컴포넌트를 대신하는 목이라면 그 invariant를 재현해야 한다는 것이다." 부족하게 명세된 목을 대상으로 유닛 테스트를 더 쓰는 건 도움이 안 된다 — 도움이 될 수가 없다. 테스트 개수가 아니라 목의 코드가 스위트가 감지할 수 있는 한계를 정하기 때문이다. 테스트 스위트가 호출 지점을 아무리 철저히 커버해도, 실제 의존성을 대신하는 것이 그 의존성의 제약을 구현하지 않았다면 결함의 한 카테고리 전체에 구조적으로 눈이 멀 수 있다.

## When to Apply

실제 네이티브/브라우저 전용 동작을 가진 서드파티 라이브러리를 유닛 테스트용으로 목으로 대체할 때는 언제나 해당한다: 가상화/윈도우 리스트, 네이티브 UI 프리미티브(바텀시트, 모달, 피커), 지도, 애니메이션 라이브러리, 제스처 핸들러 등. React Native에서는 특히 거의 피할 수 없다 — 대부분의 네이티브 모듈은 Jest 안에서 아예 돌지 않으므로, 이걸 목으로 대체하는 건 가끔 조심해야 할 예외 상황이 아니라 그런 라이브러리 위에 지어진 화면을 테스트하는 기본 조건이다. 이 실천(목을 작성하거나 확장하기 전에 라이브러리 자체 타입 정의/문서에서 문서화된 invariant를 확인하는 것)은 뭔가 터진 뒤에 적용하는 선택적 보강 단계가 아니라, 목을 작성하는 평범한 절차의 일부로 취급해야 한다.

## Examples

**사례 1 — `@gorhom/bottom-sheet`, `enableDynamicSizing` 기본값.**
목이 허용한 것: `@gorhom/bottom-sheet`의 테스트 목은 `React.forwardRef` 컴포넌트가 평범한 `View`를 감싸는 형태였다 — 동적 사이징 측정 로직이 그 안에 전혀 존재하지 않으므로, 안에 어떤 콘텐츠를 렌더링하든 그 목을 대상으로 한 테스트는 구조적으로 이 코드 경로를 절대 건드릴 수 없었다.
실제 라이브러리가 하는 것: `enableDynamicSizing`은 기본값이 `true`이고, `TodayMapSheet.tsx`는 시트 안에 조건부 콘텐츠(체크인이 없을 때는 빈 상태 `View`, 있으면 `BottomSheetFlatList`)를 렌더링한다. 그 조합이 실제 기기에서 시트를 0 높이로 측정되게 만들었다 — 던져지는 에러도, 경고도 없이, assertion이 잡을 만한 게 아무것도 없었다.
수정: `<BottomSheet>` 요소에 `enableDynamicSizing={false}`를 명시적으로 전달한다 — 시트의 `snapPoints`가 애초부터 항상 권위 있는 값이어야 했고, 콘텐츠 기반 동적 사이징은 원래부터 원한 적이 없었다.
발견 방법: 실제 iOS 시뮬레이터에서 앱을 빌드해 눈으로 직접 검사 — 이것만이 이 문제를 드러낼 수 있는 유일한 신호였다.

**사례 2 — `BottomSheetFlatList` / `VirtualizedList`, `scrollToIndex` 측정 가드.**
목이 허용한 것: 목은 `scrollToIndex`를 `useImperativeHandle`을 통해 bare `jest.fn()`으로 노출했다 — `VirtualizedList`의 실제 측정 기록을 전혀 구현하지 않았으므로 절대 throw할 수 없는 호출이었다.
실제 라이브러리가 하는 것: `VirtualizedList`는 처음 `initialNumToRender`개(기본 10개) 항목만 레이아웃이 알려지기 전에 측정한다. `TodayMapSheet.tsx`의 `selectFromPin` 핸들러는 `getItemLayout`도 `onScrollToIndexFailed`도 없이 `listRef.current?.scrollToIndex({ index, animated: true })`를 호출했다. 측정된 범위를 넘는 인덱스로 `scrollToIndex`를 호출하면 하드 `invariant()`를 던진다. 이 앱의 실제 사용 패턴(사용자가 설정한 활동 시간대 동안 시간별 체크인)은 하루 체크인 10개 초과를 일상적으로 만들어내므로, 11번째 이후 체크인의 핀을 탭하면 프로덕션에서 크래시가 났을 것이다. 그런데도 이 컴포넌트의 테스트 6개는 전부 통과했다.
수정: 실패 정보의 `averageItemLength * index`를 추정치로 써서 `scrollToOffset`을 호출한 뒤 짧은 지연 후 `scrollToIndex`를 재시도하는 `onScrollToIndexFailed` 핸들러를 추가한다 — 바로 이 React Native 제약에 대한 표준적인 우회법이다.
발견 방법: 최종 전체 브랜치 코드 리뷰 중 opus 리뷰어가 `VirtualizedList`의 실제 내부 동작을 추론해서 — 기기는 관여하지 않았지만, diff만 보고 누락된 폴백을 짚어내려면 라이브러리 내부를 충분히 알아야 했다.

**사례 3 — `react-native-maps`, `initialRegion` 마운트 전용 prop.**
목이 허용한 것: `react-native-maps` 목은 받은 prop을 그대로 `View`에 뿌리는 평범한 함수형 컴포넌트였으므로, 목에서는 prop 변경이 항상 "작동"했다 — 목 `View`가 새 값으로 그냥 다시 렌더링됐고, 그래서 "느린 위치 fix가 해결되면 지도가 재중심된다"는 테스트가, 실제 컴포넌트가 구조적으로 갖고 있지 않은 능력을 인증하면서도 통과했다.
실제 라이브러리가 하는 것: `react-native-maps`의 자체 타입 정의는 `initialRegion`이 마운트 시에만 적용된다고 명시한다("컴포넌트가 마운트된 후 이 prop을 바꿔도 region이 바뀌지 않습니다"). 이 결함은 사례 1을 고치는 과정에서만 생겨났다 — 체크인 목록이 로컬에서 로드되자마자(GPS fix를 기다리지 않고) 지도가 마운트되고, 이후 탭 포커스가 바뀌어도(시트의 스크롤/스냅 상태를 보존하려고) 계속 마운트 상태를 유지하도록 고쳤기 때문이다. 지도가 세션 동안 계속 마운트 상태를 유지하게 되자, 나중에 도착한 GPS fix가 React state를 갱신하고 새로운 `initialRegion` prop 값으로 흘러내려가도, 이미 마운트된 `MapView`가 그걸 조용히 무시했다.
수정: `TodayMapSheet` 안에 `false`로 시작하는 `hasMountedRef` boolean ref를 가진 `useEffect`를 추가한다. 이펙트의 첫 실행은 ref를 `true`로 바꾸고 즉시 반환한다(마운트 케이스는 건너뛴다 — 초기 `initialRegion` prop이 이미 첫 렌더를 올바르게 처리하므로). 이후의 모든 실행 — 즉 마운트 이후의 모든 실제 prop 변경 — 은 prop에 의존하는 대신 `mapRef.current?.animateToRegion(initialRegion, 300)`을 명령형으로 호출한다. 목도 `useImperativeHandle`로 `animateToRegion`을 노출하도록 확장해서, 마운트 이후 prop 변경 시에는 호출되고 초기 렌더 시에는 호출되지 않는다는 것을 테스트가 직접 검증할 수 있게 했다.
발견 방법: 두 번째의, 후속 전체 브랜치 재검토에서 opus 리뷰어가 — 이 결함은 첫 리뷰 시점에는 존재하지 않았고 사례 1의 수정 자체가 만들어낸 것이라, 첫 리뷰가 아니라 두 번째 전체 재검토가 이걸 잡을 수 있었던 이유다.

## Related

- [`expo-router-notification-lifecycle-qa.md`](../integration-issues/expo-router-notification-lifecycle-qa.md) — 직접적인 중복은 아니지만("유닛 테스트 mock의 런타임 invariant 누락" vs. "시뮬레이터 push fixture 페이로드가 실제 APNs 형식과 다름"), "테스트 더블/픽스처가 실제 런타임 동작과 어긋나는데 테스트는 통과한다"는 주제가 느슨하게 겹친다.
