# FootLog

매일 시간 단위로 위치를 "체크인"해서 자신의 이동 패턴을 공간적으로 회고하는 앱. 반복되는 동선과 새로 가본 곳을 구분해 인식하게 하여, 더 다양한 장소를 탐험하도록 동기를 부여하는 것이 목표.

전체 설계는 [docs/superpowers/specs/2026-08-02-location-checkin-diary-design.md](docs/superpowers/specs/2026-08-02-location-checkin-diary-design.md)를 참조. 아직 구현 전 단계이며, 이 파일은 코드가 추가되면서 계속 갱신되어야 함.

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

## MVP 범위

포함: 체크인 기록, 캘린더로 과거 로그 다시보기, 하루 단위 자동 요약(지도 핀 모음)
제외 (v2 후보): 자주 가는 곳/새로운 곳 분석·시각화, 역지오코딩 기반 장소명 표시, 다기기 실시간 설정 동기화, 그룹/소셜 공유
