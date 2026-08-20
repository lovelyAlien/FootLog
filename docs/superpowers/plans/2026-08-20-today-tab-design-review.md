# 오늘 탭 디자인 리뷰

- 작성일: 2026-08-20
- 도구: `/plan-design-review` (gstack)
- 대상: `오늘` 탭 — [`mobile/app/(tabs)/index.tsx`](../../../mobile/app/(tabs)/index.tsx) → [`TodayMapSheet.tsx`](../../../mobile/src/features/check-in/TodayMapSheet.tsx) + [`CheckInListRow.tsx`](../../../mobile/src/features/check-in/CheckInListRow.tsx) + [`CheckInMapPins.tsx`](../../../mobile/src/features/check-in/CheckInMapPins.tsx)
- 근거: iPhone 17 Pro 시뮬레이터 실기기 확인(스크린샷) + 소스 코드 리딩 + `docs/superpowers/specs/2026-08-06-core-ux-flow-design.md`

## 이미 존재하는 것 (재사용함)

- `theme.ts`의 색상 토큰 — 이번 수정도 전부 기존 토큰만 사용, 새 하드코딩 없음.
- 44px 이상 터치 타겟, `accessibilityLabel` 관례 — 기존 패턴 그대로 따름.
- `DailyDetailScreen.tsx`의 "체크인 N개" 서브타이틀 패턴 — 오늘 탭에도 동일하게 적용.
- `noticeBackground` / `noticeText` 토큰 — 정의만 되어 있고 그동안 어디서도 쓰이지 않던 것을 위치 권한 안내 배너에 처음 사용.

## 스코프 아님 (의도적 제외)

- **스트릭/게이미피케이션 요소**: `core-ux-flow-design.md` 1절 "제품이 사용자를 직접 평가하거나 과제로 제시하지 않는다"와 상충하므로 추가하지 않음.
- **DESIGN.md 생성**: 오늘 탭 리뷰 범위를 넘어서는 별도 워크플로우라 이번엔 진행하지 않고 TODOS.md로 이관.

## Step 0 — 초기 평가

**6/10.** 지도 우선 레이아웃과 3단 바텀시트, 핀↔리스트 선택 연동, 비평가적 톤의 빈 상태 문구는 스펙과 잘 맞음. 가장 큰 갭은 지도 핀/라인의 브랜딩 부재, 위치 권한 거부 상태 미처리, FAB 전환 애니메이션 부재였음.

## 7-Pass 리뷰 결과

| # | 패스 | 점수 | 핵심 발견 | 조치 |
|---|------|------|-----------|------|
| 1 | 정보구조 | 8/10 | 지도→헤더→리스트→FAB 순서가 스펙과 일치. peek 상태에 체크인 개수 요약이 없었음 | ✅ 수정 |
| 2 | 상태 커버리지 | 5/10 | 로딩 상태에 스피너 없음, 에러 상태에 재시도 버튼 없음, 위치 권한 거부 시 안내 전무 | ✅ 수정 |
| 3 | 사용자 여정 | 7/10 | 빈 상태 톤이 "평가하지 않는다" 원칙과 잘 맞음. 로딩의 정적임이 첫 5초 인상에서 불안 유발 가능 | ✅ 수정(Pass 2와 동일 조치) |
| 4 | AI 슬롭 리스크 | 6/10 | 시스템 기본 폰트 사용(블랙리스트 11번), 기본 MapKit 빨간 핀, FAB 전환 애니메이션 없음 | 폰트는 TODO로 이관, 핀/FAB는 ✅ 수정 |
| 5 | 디자인시스템 정합성 | 7/10 | 내부 일관성은 좋음. `CheckInMapPins.tsx`의 `pinColor={... : undefined}`가 테마를 벗어난 기본색으로 샘 | ✅ 수정 |
| 6 | 반응형·접근성 | 6/10 | 터치 타겟·라벨은 양호. 지도 캡션(`mapCaption`)이 WCAG AA 명도 대비 미달. 다크모드 토큰 없음 | 캡션은 ✅ 수정, 다크모드는 TODO로 이관 |
| 7 | 미결정 사항 | — | 아래 "결정된 사항" 참고 | — |

### 결정된 사항 (AskUserQuestion으로 확인)

1. DESIGN.md는 지금 만들지 않고 리뷰 먼저 진행 → 채택.
2. 7패스 전부 균등하게 리뷰 → 채택.
3. 시각/브랜딩 갭(핀, FAB 애니메이션) 즉시 수정 → 채택, 완료.
4. 상태 커버리지 갭(에러 재시도, 권한 거부 안내, 로딩 스피너) 즉시 수정 → 채택, 완료.
5. 접근성/정보구조 갭(캡션 대비, 체크인 개수) 즉시 수정, 다크모드는 TODO로 이관 → 채택, 완료.
6. 폰트 교체는 이번 스코프에서 제외, DESIGN.md 작업으로 이관 → 채택, `TODOS.md`에 기록.
7. 다크모드는 TODO로 이관 → 채택, `TODOS.md`에 기록.

## 실제 변경 사항

- [`mobile/src/shared/theme.ts`](../../../mobile/src/shared/theme.ts) — `mapRoute` 토큰 추가.
- [`mobile/src/features/check-in/CheckInMapPins.tsx`](../../../mobile/src/features/check-in/CheckInMapPins.tsx) — 핀 색상을 테마 기반으로 통일(선택 시 `primary`, 비선택 시 `primarySoftText`), 경로선을 점선 + 테마 색상으로 변경(실제 GPS 경로가 아님을 시각적으로도 강화).
- [`mobile/src/features/check-in/TodayMapSheet.tsx`](../../../mobile/src/features/check-in/TodayMapSheet.tsx) — FAB opacity 전환을 `Animated.timing`으로 부드럽게, 헤더에 "체크인 N개" 서브타이틀 추가, `mapCaption` 색상을 `textMuted` → `textSecondary`로 변경(WCAG AA 충족).
- [`mobile/app/(tabs)/index.tsx`](../../../mobile/app/(tabs)/index.tsx) — 로딩 상태에 `ActivityIndicator` 추가, 에러 상태에 "다시 시도" 버튼 추가(기존 이펙트 본문을 재사용 가능한 `load` 콜백으로 분리), 위치 권한 거부 시 인라인 안내 배너 추가.
- [`mobile/__tests__/CheckInMapPins.test.tsx`](../../../mobile/__tests__/CheckInMapPins.test.tsx) — 기본 빨간 핀 가정 테스트를 새 브랜드 색상 검증으로 갱신.
- [`TODOS.md`](../../../TODOS.md) — 폰트 교체(DESIGN.md 연계), 다크모드 토큰 2건 기록.

## 검증

- `npx tsc --noEmit -p .` — 통과.
- `npm run lint` (expo lint) — 통과.
- `npm test` — 33개 스위트, 181개 테스트 전부 통과 (핀 색상 테스트 1건 갱신 포함).
- iPhone 17 Pro 시뮬레이터 실기기 확인 — 핀 브랜딩 색상, "체크인 1개" 서브타이틀 반영 확인.

## Implementation Tasks
이 리뷰의 발견 사항에서 도출한 작업 목록. T1-T4는 이번 세션에서 이미 구현·검증 완료. T5-T6은 스코프 밖(앱 전체 영향)이라 TODOS.md로 이관.

- [x] **T1 (P1, human: ~30min / CC: ~5min)** — map-pins — 지도 핀/경로선 브랜딩 적용
  - Surfaced by: Pass 4/5 — `CheckInMapPins.tsx`가 기본 MapKit 빨간 핀과 무테마 폴리라인을 그대로 사용
  - Files: `mobile/src/features/check-in/CheckInMapPins.tsx`, `mobile/src/shared/theme.ts`
  - Verify: `npm test -- CheckInMapPins`
- [x] **T2 (P1, human: ~20min / CC: ~5min)** — today-fab — FAB opacity 전환을 Animated로 부드럽게
  - Surfaced by: Pass 4 — FAB 표시/숨김이 즉시 전환되어 미완성처럼 느껴짐
  - Files: `mobile/src/features/check-in/TodayMapSheet.tsx`
  - Verify: `npm run lint` (react-hooks/refs 회귀 확인)
- [x] **T3 (P1, human: ~40min / CC: ~10min)** — today-states — 로딩 스피너·에러 재시도·위치 권한 거부 안내 추가
  - Surfaced by: Pass 2 — 로딩/에러/권한거부 상태 커버리지 부족
  - Files: `mobile/app/(tabs)/index.tsx`
  - Verify: `npm test -- TodayRoute`
- [x] **T4 (P2, human: ~15min / CC: ~5min)** — today-a11y — 지도 캡션 명도 대비 WCAG AA 충족, peek 상태 체크인 개수 표시
  - Surfaced by: Pass 1/6 — 정보 계층 및 접근성 명도 대비 미달
  - Files: `mobile/src/features/check-in/TodayMapSheet.tsx`
  - Verify: `npm test -- TodayMapSheet`
- [ ] **T5 (P3, human: ~1일 / CC: ~2h)** — design-system — DESIGN.md 작성 + 앱 전체 커스텀 폰트 적용
  - Surfaced by: Pass 4/5 — 시스템 기본 폰트, DESIGN.md 부재
  - Files: `TODOS.md` (추적)
  - Verify: `/design-consultation` 실행 후 재검토
- [ ] **T6 (P3, human: ~1일 / CC: ~3h)** — theming — 다크모드 토큰 및 전체 적용
  - Surfaced by: Pass 6 — 다크모드 미대응
  - Files: `mobile/src/shared/theme.ts`, `TODOS.md` (추적)
  - Verify: 다크모드 시뮬레이터 확인 + 전체 화면 스냅샷

## GSTACK REVIEW REPORT

| Run | Status | Findings |
|---|---|---|
| Pre-review 시스템 감사 | 완료 | DESIGN.md 없음(플래그함), UI 스코프 = 오늘 탭 3개 컴포넌트 |
| Step 0 초기 평가 | 완료 | 6/10, 3대 갭 식별 |
| Step 0.5 시각 목업 | 스킵 | `$D` OpenAI API 키 미설정 — 텍스트 기반 리뷰 + 실기기 스크린샷으로 대체 |
| 7-Pass 리뷰 | 완료 | 정보구조 8, 상태커버리지 5→수정, 사용자여정 7, AI슬롭 6→일부수정, 디자인시스템 7→수정, 접근성 6→수정 |
| 코드 수정 및 검증 | 완료 | tsc/lint/jest 전부 통과, 시뮬레이터 실기기로 핀 브랜딩·체크인 개수 확인 |
| TODOS.md 기록 | 완료 | 폰트 교체(DESIGN.md 연계), 다크모드 2건 |

**VERDICT: PASS — 오늘 탭의 핵심 디자인 갭(브랜딩, 상태 커버리지, 접근성)을 리뷰 세션 내에서 직접 수정하고 검증까지 완료. 폰트 교체와 다크모드는 앱 전체 범위라 TODOS.md로 의도적으로 이관.**

NO UNRESOLVED DECISIONS
