# 오늘 탭 지도+타임라인 설계

- 작성일: 2026-08-19
- 상태: 승인됨
- 관계: `docs/product/footlog-prd.md`의 FR-M1-04(오늘과 캘린더 조회), `2026-08-06-core-ux-flow-design.md` 2절(정보 구조)의 후속 상세 설계
- 우선순위: PRD FR-M1-04와 충돌하면 PRD를 우선한다.

## 1. 배경

`오늘` 탭은 현재 `TodayCheckIns.tsx`에서 텍스트 리스트(시각 + 정확도)만 보여준다. 그러나 PRD FR-M1-04는 "오늘 화면에 지도 핀과 시간순 타임라인을 표시"하고 "지도 핀과 타임라인의 선택 상태가 연동"되도록 요구한다. 이 요구사항은 M1(현재 구현 대상 마일스톤)에 속하며, foundation 계획(`2026-08-06-foundation-local-checkin.md`)이 PRD보다 먼저 작성되어 지도 없는 리스트로 구현된 뒤 갱신되지 않은 상태다.

캘린더 탭의 날짜 상세 화면(`day/[date].tsx` → `DailyDetailScreen.tsx`)은 이미 지도 핀 + 활동시간대 타임라인 슬롯을 구현하고 있으나, 회고 입력 폼과 한 화면에 섞여 있고 스크롤 기반이다. 이 설계는 오늘 탭에 한정하며, 캘린더 탭 개선은 범위에서 제외한다(별도 세션에서 다룰 예정).

## 2. 목표 / 비목표

**목표**

- 오늘 탭에서 지도 핀과 시간순 타임라인을 보고, 서로 선택 상태가 연동되게 한다(FR-M1-04 충족).
- 기존 체크인 흐름(`지금 체크인` → `/check-in`)과 알림 설정 진입을 그대로 유지한다.

**비목표**

- 캘린더 탭(`DailyDetailScreen`)의 레이아웃 변경 — 현재의 스크롤 구조(지도 → 회고)를 그대로 둔다.
- 회고 작성/편집 UI — 오늘 탭에는 포함하지 않는다.
- 백그라운드 위치 추적 — 이 설계는 foreground 위치 조회만 사용한다("위치 권한은 사용 중만" 원칙 유지).

## 3. 화면 구조

오늘 탭(`(tabs)/index.tsx`)을 지도 우선 레이아웃으로 교체한다.

- **지도 영역**: 화면 대부분을 차지하는 `MapView`. 오늘 체크인 핀과, 실제 경로가 아닌 기록 지점의 시간순 연결선(Polyline)을 표시한다.
- **체크인 FAB**: 지도 우하단에 떠 있는 원형 버튼("지금 체크인", 44pt 이상). 시트 스냅 상태와 무관하게 항상 지도 위에 고정되어 가려지지 않는다. `router.push('/check-in')`으로 기존 체크인 흐름에 연결한다.
- **바텀시트**: `@gorhom/bottom-sheet` 기반 드래그 가능한 다중 스냅 시트(peek / half / full). 오늘 실제로 체크인한 기록만 시간순 카드로 나열한다(활동시간대 전체 슬롯 그리드는 쓰지 않는다).
- **알림 설정 진입**: 기존과 동일하게 헤더/시트 상단에서 진입 가능하게 유지한다.

## 4. 컴포넌트 아키텍처

- **신규** `mobile/src/features/check-in/TodayMapSheet.tsx` — 오늘 탭 전용 화면. 기존 `TodayCheckIns.tsx`를 대체한다.
- **신규(공용)** `mobile/src/features/check-in/CheckInMapPins.tsx` — `DailyDetailScreen.tsx`에 인라인으로 있던 `Marker`+`Polyline` 렌더링(선택 시 강조색 포함)을 추출한 프레젠테이션 컴포넌트. 오늘 탭과 캘린더 상세 화면 양쪽에서 사용해 핀 시각 언어(강조색, 연결선 캡션 문구)가 어긋나지 않게 한다.
- **캘린더 탭 유지** — `DailyDetailScreen.tsx`는 지도 마커 렌더링만 `CheckInMapPins`로 교체하고, 그 외 스크롤/회고 구조는 손대지 않는다.
- **신규** `mobile/src/features/check-in/CheckInListRow.tsx` — 시트 안에서 쓰는 카드(시각 + 정확도, 선택 상태 스타일). `DailyDetailScreen`의 활동시간대 슬롯 그리드와는 시각적으로 다르므로 공유하지 않는다.
- **신규 의존성** `@gorhom/bottom-sheet` — 기존 `react-native-gesture-handler`, `react-native-reanimated` 위에서 동작한다. `mobile/app/_layout.tsx`(루트 레이아웃)에는 현재 `GestureHandlerRootView`가 없으므로, 이번 작업에서 최상위 `Stack`을 이것으로 감싸는 변경을 포함한다.

## 5. 데이터 흐름

- `(tabs)/index.tsx`는 기존과 동일하게 `repository.listByLocalDay()`로 오늘 체크인을 로드한다(변경 없음).
- 화면 마운트 시 `new ExpoLocationGateway().requestForegroundPermission()`을 호출해 위치 권한을 확인한다. 허용되면 `getCurrentFix()`로 초기 지도 region을 계산한다.
- 활동시간대(`notificationSettings.startHour/endHour`)는 이 화면에서 조회하지 않는다 — 리스트가 실제 체크인만 보여주므로 해당 의존성을 새로 끌어올 필요가 없다.

### 초기 지도 region 결정 로직

순수 함수 `resolveInitialMapRegion(locationPermission, locationFix, checkIns)`로 분리하며, 우선순위는 다음과 같다.

1. 위치 권한이 허용되고 `getCurrentFix()`가 성공하면 → 현재 위치 중심
2. 실패하거나 권한이 거부되면, 오늘 체크인이 1건 이상 있으면 → 가장 최근 체크인 좌표 중심
3. 그마저도 없으면 → 고정 기본 좌표(서울 시청)

## 6. 상호작용 상세

- **핀 → 시트**: 지도 핀을 탭하면 시트가 half 스냅으로 자동 확장되고, 해당 체크인 카드로 스크롤된다.
- **시트 → 핀**: 카드를 탭하면 지도에서 해당 핀이 강조색으로 표시되고 region이 그 좌표로 이동한다.
- **위치 권한 요청 시점**: 오늘 탭 진입 시(체크인 버튼을 누르기 전) 바로 요청한다. 권한이 미결정 상태면 탭 진입과 함께 다이얼로그가 뜬다. 체크인 자체의 권한 요청 로직(`/check-in` 화면)은 이 변경과 독립적으로 그대로 유지된다.
- **빈 상태(오늘 체크인 0건)**: 지도는 현재 위치 중심으로 핀 없이 표시하고, 시트에는 "오늘의 발자국이 아직 없어요" 안내 문구를 넣는다. FAB는 계속 노출되어 체크인 흐름 진입을 막지 않는다.

## 7. 에러 / 엣지 케이스

- **위치 권한 거부**: 지도는 5절의 폴백 region으로 표시한다. FAB는 계속 눌러서 체크인 흐름에 진입할 수 있다(체크인 자체의 위치 획득 실패 처리는 기존 로직 그대로).
- **오늘 체크인 0건**: 6절의 빈 상태를 따른다.
- **지도 컴포넌트 로딩/렌더 실패**: 별도의 지도 전용 폴백 UI를 만들지 않고, 기존 전체화면 로딩 실패 패턴(`hasError` → "오늘의 발자국을 불러오지 못했어요")을 그대로 재사용한다.

## 8. 테스트 전략

- `TodayMapSheet.test.tsx` (기존 `TodayCheckIns.test.tsx` 대체): `react-native-maps`, `@gorhom/bottom-sheet`를 목 처리하고, 체크인 목록이 카드로 렌더되는지, 카드 탭 시 선택 콜백이 호출되는지, 빈 상태 문구, FAB 접근성 라벨과 라우팅을 검증한다.
- `CheckInMapPins.test.tsx` (신규): 체크인 개수만큼 마커가 생성되는지, 선택된 체크인의 핀 색이 바뀌는지 — `DailyDetailScreen` 기존 테스트가 쓰는 `react-native-maps` 목 패턴을 그대로 따른다.
- `resolveInitialMapRegion.test.ts` (신규): 5절의 3가지 분기(현재 위치 성공 / 실패+체크인 있음 / 실패+체크인 없음)를 순수 함수 단위 테스트로 커버한다.
- 바텀시트의 실제 드래그 제스처(peek↔half↔full)는 RNTL로 검증하기 어려운 영역이다 — 스냅포인트 상수와 "핀 탭 시 목표 스냅포인트로 전환 요청이 호출되는지"만 단위 테스트하고, 실제 드래그 손맛은 `expo run:ios --no-bundler`로 시뮬레이터 수동 QA로 확인한다.
- 새 네이티브 의존성이 추가되므로, 기존 자동검사 순서(`npm test` → `typecheck` → `lint` → `expo-doctor`)에 더해 `npx expo run:ios --no-bundler`로 시뮬레이터 빌드까지 확인한다.

## 9. 후속 작업 (이번 범위 제외)

- 캘린더 탭 `DailyDetailScreen`의 레이아웃 개선은 별도 세션에서 다룬다. 이번 설계로 추출한 `CheckInMapPins`는 그 작업에서 재사용 가능하다.
