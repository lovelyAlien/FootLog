# Design System — FootLog

## Product Context
- **What this is:** 매일 시간 단위로 위치를 명시적으로 "체크인"해서 자신의 이동 패턴을 공간적으로 회고하는 로컬퍼스트 모바일 앱.
- **Who it's for:** 반복되는 동선과 새로 가본 곳을 구분해서 더 다양한 장소를 탐험하고 싶은 개인 사용자.
- **Space/industry:** 위치 기반 라이프로깅 / 습관 트래커 (Swarm, Day One, Oura 계열과 인접).
- **Project type:** React Native 모바일 앱 (iOS + Android). 웹 타겟 없음.

## Aesthetic Direction
- **Direction:** Organic/Natural — 따뜻한 중성색과 절제된 형태.
- **Decoration level:** minimal — 타이포와 여백이 위계를 만들고, 장식 요소(그라디언트·아이콘 서클·그림자 과다)는 쓰지 않는다.
- **Mood:** "매일 반복되는 가벼운 습관." 체크인은 업무 도구가 아니라 부담 없는 일상 동반자로 느껴져야 한다. 채도 높은 SaaS 파랑 대신 따뜻한 종이색 배경과 차분한 딥틸 액센트로 그 느낌을 낸다.
- **Reference sites:** [Oura app design system](https://www.instrument.com/work/oura-app) (조용하고 절제된 무드, 자연광 톤 컬러), [Swarm by Foursquare](https://medium.com/foursquare-direct/how-we-designed-foursquare-swarm-5-0-d774b3164f3f) (지도+연결선+바텀시트 구조 — 이미 검증된 패턴이라 그대로 유지)

## Typography
- **Display/Hero:** Fraunces 500 Medium — 캘린더 월/연도 타이틀(예: `2026년 8월`). 화면당 하나뿐인 헤더 숫자에만 쓰는 서명 같은 포인트.
- **Body:** 시스템 폰트 (iOS: San Francisco / Android: Roboto + Noto Sans KR 폴백) — 한글이 대부분인 본문·라벨. 한글 글리프셋을 포함한 커스텀 폰트는 무게가 커서 "가벼운 습관" 포지셔닝과 부딪히므로 의도적으로 시스템 폰트를 유지한다.
- **UI/Labels:** 시스템 폰트 (Body와 동일)
- **Data/Tables:** Fraunces 500 Medium — 체크인 목록 카드의 시각(예: `14:32`). 정확도·캡션 등 부가 텍스트는 시스템 폰트 유지.
- **Code:** 해당 없음 (코드/로그를 사용자에게 노출하는 화면 없음)
- **Loading:** `@expo-google-fonts/fraunces`의 500 Medium 정적 웨이트 파일 1개만 `expo-font`로 번들링(가변 폰트 전체가 아니라 실제 쓰는 웨이트 하나만). 한글은 시스템 폰트에 맡기므로 추가 글리프셋 번들 없음.
- **Scale:**
  | Role | Size | Font |
  |---|---|---|
  | display-md | 26px | Fraunces 500 Medium |
  | title | 20px | 시스템 |
  | body | 16–17px | 시스템 |
  | label | 14–15px | 시스템 |
  | caption | 12–13px | 시스템 |

## Color
- **Approach:** restrained — 배경/텍스트 중성색 + 액센트 1개.
- **Primary:** `#3E6259` (딥 파인틸) — 버튼, FAB, 선택 상태. 기존 `#2e6af0`(채도 높은 SaaS 파랑) 대체.
- **Secondary/soft:** `primarySoftBackground #E9EFE9`, `primarySoftText #2C4A42` — 보조 버튼(예: "알림 설정") 배경/텍스트 페어.
- **Neutrals (light):** background `#FAF7F2`(따뜻한 종이색) · textPrimary `#221F1B` · textSecondary `#5A554D` · textMuted `#9A9186` · border `#E8E1D6` · borderMuted `#D6CDBE`
- **Semantic:** error `#B42318`(유지, 손대지 않음) · notice background `#FBF1E4` / text `#7C2D12`
- **Dark mode:** 표면을 단순 반전이 아니라 별도 톤으로 설계. background `#17140F` · surface `#1D1912` · textPrimary `#F1EDE5`(순백 아님) · textSecondary `#BDB3A4` · textMuted `#857A6B` · primary `#6FA093`(라이트 대비 채도·명도 상향 조정, 어두운 배경에서 가독성 확보) · onPrimary `#12201C` · primarySoftBackground `#1E2B27` · primarySoftText `#9CC2B6` · border `#332D24` · borderMuted `#453D31` · error `#E5695A` · noticeBackground `#2B2013` · noticeText `#F0B37E`

## Spacing
- **Base unit:** 8px
- **Density:** comfortable
- **Scale:** 2xs(2) xs(4) sm(8) md(16) lg(24) xl(32) 2xl(48) 3xl(64)

## Layout
- **Approach:** grid-disciplined — 단일 컬럼, 예측 가능한 정렬 (모바일 전용, 데스크톱/웹 그리드 해당 없음)
- **Grid:** 해당 없음 (단일 컬럼 모바일 레이아웃)
- **Max content width:** 해당 없음 (디바이스 폭 전체 사용)
- **Border radius:** sm 10px(버튼·인풋) · md 14–16px(카드) · lg 24px(바텀시트 상단 모서리) · full 999px(FAB, 원형 요소)

## Motion
- **Approach:** minimal-functional — 이해를 돕는 전환만. 화려한 애니메이션은 쓰지 않는다.
- **Easing:** enter(ease-out) exit(ease-in) move(ease-in-out)
- **Duration:** micro(50–100ms) short(150–250ms) medium(250–400ms) long(400–700ms)

## Decisions Log
| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-08-20 | Initial design system created | `/design-consultation`으로 생성. 기존 `mobile/src/shared/theme.ts` 컬러 토큰(채도 높은 SaaS 파랑 `#2e6af0`)을 검토한 뒤, "매일 반복되는 가벼운 습관"이라는 목표에 맞춰 따뜻한 중성색 + 딥틸 액센트, 숫자 전용 세리프(Fraunces) 포인트로 방향을 조정. Oura·Swarm 리서치 기반. |
| 2026-08-20 | 코드에 실제 적용 | `theme.ts` 컬러를 새 팔레트로 교체(`mapRoute`, `buttonSecondaryText`, `buttonTertiaryText`, `optionBorder`, `optionText` 등 문서 작성 시점엔 없던/누락됐던 토큰도 같은 warm-neutral 원칙으로 맞춤). `@expo-google-fonts/fraunces`의 500 Medium 정적 웨이트를 설치해 캘린더 월 타이틀과 체크인 목록 카드 시각에 적용. 체크인 확정 화면에는 애초에 시각을 표시하는 UI가 없었음을 확인해 Display/Hero 설명에서 제거. 다크모드 팔레트는 값만 정의된 상태이며, 앱에 라이트/다크 전환 인프라 자체가 없어 실제 토글 구현은 하지 않음(추후 필요 시 별도 작업). |
