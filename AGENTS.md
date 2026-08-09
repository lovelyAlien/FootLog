# FootLog

매일 시간 단위로 위치를 "체크인"해서 자신의 이동 패턴을 공간적으로 회고하는 앱. 반복되는 동선과 새로 가본 곳을 구분해 인식하게 하여, 더 다양한 장소를 탐험하도록 동기를 부여하는 것이 목표.

기반 설계는 [docs/superpowers/specs/2026-08-02-location-checkin-diary-design.md](docs/superpowers/specs/2026-08-02-location-checkin-diary-design.md), 승인된 핵심 UX와 최신 MVP 범위는 [docs/superpowers/specs/2026-08-06-core-ux-flow-design.md](docs/superpowers/specs/2026-08-06-core-ux-flow-design.md)를 참조. 두 문서가 충돌하면 UX와 MVP 범위에는 후자를 우선 적용한다. 아직 구현 전 단계이며, 문서는 코드가 추가되면서 계속 갱신되어야 함.

## 스택

- 모바일: React Native (iOS + Android)
- 백엔드: Spring Boot
- DB: PostgreSQL + PostGIS

## 핵심 원칙

- **로컬 우선(local-first)**: 위치 체크인은 항상 기기 SQLite에 먼저 저장. 서버는 백업/다기기 동기화 역할만 하며, 오프라인에서도 기록·조회가 끊김 없이 동작해야 함.
- **알림은 기기가 전담**: 매시간 알림은 서버 푸시가 아니라 기기 로컬 알림(`NotificationScheduler`)으로 예약. 서버는 알림 타이밍을 알 필요 없음.
- **위치 권한은 "사용 중"만**: 백그라운드 상시 위치 추적을 하지 않으므로 iOS "Always" 권한을 요구하지 않음. 요구하는 코드가 추가되면 설계 위반이므로 주의.
- **동기화는 클라이언트 UUID 기반 idempotent upsert**: 재전송으로 인한 중복 저장을 막기 위해 서버 쪽 upsert 키는 항상 클라이언트 생성 UUID.

## 네이밍 컨벤션

- 위치 기록 행위는 "캡처"가 아니라 **"체크인(check-in)"** 으로 부름 (화면 캡처와 혼동 방지, Foursquare/Swarm 패턴 차용).
  - 화면: `CheckInScreen`
  - 함수: `getCurrentLocation()` / `requestLocation()`
  - DB 테이블: `check_ins`

## Superpowers 완료 워크플로우

Superpowers로 구현 계획을 실행할 때는 다음 완료 순서를 지킨다.

1. 구현과 검증을 완료한다.
2. 최종 코드 리뷰를 수행하고, 발견된 중요 이슈를 수정한 뒤 재검토를 통과한다.
3. 최종 리뷰가 통과하면 `ce-compound mode:headless`를 실행한다. Compound에는 실행·검토 사이클에서 발생한 실수, 실패한 접근, 근본 원인, 수정 방법, 재발 방지 규칙과 검증 방법을 포함한다.
4. Compound 문서가 `docs/solutions/`에 생성되고 검증되기 전에는 전체 작업을 완료로 보고하지 않는다.

Compound는 최종 리뷰를 대체하지 않으며, 리뷰 통과 후에만 수행한다. 후속 작업은 작성된 해결 문서와 `CONCEPTS.md`를 먼저 검색해 같은 실수를 반복하지 않도록 한다.

## MVP 범위

포함: 사용자 확인 체크인, 사진 1장·짧은 메모, 사진 서버 백업, 캘린더와 지도 중심 일일 회고, 날짜별 회고 본문·선택 알림, 객관적 주간 발견

제외: 역지오코딩, 회고 자동 분석, 탐험 추천·점수화, 여러 사진·영상·음성, 백그라운드 경로 추적, 그룹·소셜 공유
