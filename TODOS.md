# TODOS

## 앱 전체 타이포그래피를 커스텀 폰트로 교체

- **What**: `theme.ts` 및 전체 화면 스타일에서 지정하지 않고 있는 `fontFamily`를 실제 서칸 폰트로 명시. Google Fonts 등에서 한글을 지원하는 폰트를 선정해 `expo-font`로 번들·로드.
- **Why**: 현재 모든 화면이 iOS 시스템 기본 폰트(San Francisco)를 그대로 쓰고 있음. 이는 gstack AI 슬롭 블랙리스트 11번("system-ui/-apple-system을 주 폰트로 — 타이포그래피를 포기한 신호")에 정확히 해당하는 패턴. (오늘 탭 디자인 리뷰, 2026-08-20, `docs/superpowers/plans/2026-08-20-today-tab-design-review.md`)
- **Pros**: 브랜드 정체성 강화, "고려된 디자인"으로 보이게 함. `/design-consultation`으로 만들 DESIGN.md의 타이포그래피 스케일과 자연스럽게 통합 가능.
- **Cons**: 새 폰트 에셋 추가 + `expo-font` 로딩 화면 처리 + 모든 화면 스타일 검증이 필요해 오늘 탭 범위를 넘어선 앱 전체 작업. 폰트 선정 자체가 별도의 디자인 판단 필요.
- **Context**: DESIGN.md가 아직 없는 상태(2026-08-20 기준)이므로, 폰트 선정은 DESIGN.md 작성과 한 번에 진행하는 것을 권장.
- **Depends on / blocked by**: `/design-consultation` (DESIGN.md 생성) 먼저 진행 권장.

## theme.ts에 다크모드 토큰 추가

- **What**: `theme.ts`의 `colors`에 라이트/다크 대응쌍(배경, 텍스트, 테두리, primary 계열 등)을 추가하고 `useColorScheme` 기반으로 전체 화면에 적용.
- **Why**: 현재 모든 색상이 라이트 전용으로 하드코딩되어 있어, iOS 시스템 다크모드를 쓰는 사용자는 앱을 열 때마다 눈부심을 겪음. (오늘 탭 디자인 리뷰, 2026-08-20, `docs/superpowers/plans/2026-08-20-today-tab-design-review.md`)
- **Pros**: 시스템 설정과 일관된 경험, 야간 사용성 개선.
- **Cons**: 오늘 탭 하나가 아니라 캘린더·일일회고·설정 등 전체 화면 검증이 필요한 앱 전역 작업. 지도 스타일(MapView)도 다크 대응이 별도로 필요.
- **Context**: MVP 범위(`CLAUDE.md`)에 다크모드가 명시돼 있지 않음 — 별도 우선순위 판단 필요.
- **Depends on / blocked by**: 없음. 단독으로 진행 가능.
