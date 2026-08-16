# FootLog 동기화 도메인 스키마·API 설계

- 작성일: 2026-08-16
- 상태: 구현 완료 (백엔드 13개 태스크 구현 및 최종 브랜치 리뷰 완료, 4절 변경 이력 참고)
- 관계: `docs/superpowers/specs/2026-08-14-server-sync-photo-backup-design.md`의 "5. 동기화 아키텍처"가 정한 아키텍처(엔터티별 쓰기 API + 커서 기반 변경 로그, presigned URL 사진 업로드, last-write-wins)를 그대로 따르되, 컬럼 타입·제약조건·인덱스·요청/응답 스키마 수준까지 구체화한다. 아키텍처 자체는 재논의하지 않는다.
- 우선순위: 제품 요구사항과 수용 기준은 `docs/product/footlog-prd.md`를 우선한다. 이 문서는 그 수용 기준(FR-M3-02, M3 기술 선행조건)을 만족하는 DB·API 설계만 다룬다.
- 범위 제외: 인증(카카오 로그인, 세션 발급·전환)은 이 문서에서 다루지 않는다. `users` 테이블과 세션 관련 API는 별도 인증 설계 문서 소관이며, 이 문서는 `user_id` 컬럼을 그 테이블에 대한 FK로만 참조한다. 클라이언트 SQLite 스키마 변경(동기화 아웃박스, `sync_status` 확장)도 범위 밖 — 구현 계획(writing-plans) 단계에서 이 문서를 근거로 결정한다.

## 1. 공통 규약

| 항목 | 규칙 |
|---|---|
| DB 컬럼명 | snake_case (기존 마이그레이션 관례 유지) |
| JSON 필드명 | camelCase (모바일 `mobile/src/features/check-in/domain.ts`의 `accuracyM`, `checkedInAt` 등과 그대로 대응) |
| 타임스탬프 | 모든 API 요청/응답은 ISO-8601 UTC 문자열(예: `2026-08-16T09:00:00Z`). DB는 `timestamptz` |
| ID | 클라이언트 생성 UUID v4, 문자열 |
| 에러 응답 | `{ "code": "SNAKE_CASE_CONSTANT", "message": "사람이 읽는 설명" }` |
| 인증 | 모든 엔드포인트는 인증 세션이 필요(세션 검증 자체는 별도 인증 설계 문서 소관). 요청 바디에 `userId`를 받지 않고 세션에서 파생한다 |
| 데이터 격리 | 다른 사용자 소유 리소스에 대한 접근은 존재 여부를 노출하지 않기 위해 403이 아닌 `404`로 응답한다(NFR-06) |
| PostGIS 사용 범위 | `latitude`/`longitude`는 `double precision`으로만 저장한다. M4 공간 군집에 필요한 `geography` 컬럼 추가는 주간 발견 알고리즘 명세(PRD 16절 미결정 항목)가 확정된 뒤 별도 마이그레이션으로 도입한다 — 알고리즘이 정해지지 않은 채 컬럼 형태를 먼저 고정하지 않는다 |
| 소유권 마스킹 코드 | 클라이언트 UUID가 다른 사용자 소유 엔터티와 충돌하는 경우(예: 재사용된 첨부 UUID) 모두 `404 {ENTITY}_NOT_FOUND` 계열 코드로 응답한다(`CHECK_IN_NOT_FOUND`, `CHECK_IN_NOTE_NOT_FOUND`, `REFLECTION_NOT_FOUND`, `PHOTO_NOT_FOUND`) — 어떤 사용자가 그 id를 이미 사용했는지 노출하지 않는다(NFR-06) |
| 삭제된 리소스 재작성 코드 | 메모·회고처럼 편집 가능한 엔터티는 이미 소프트 삭제된 id로 PUT이 재수신되면 `409 {ENTITY}_DELETED`로 거부한다(`CHECK_IN_NOTE_DELETED`, `REFLECTION_DELETED`) — 삭제를 종단 상태로 취급하며, 같은 부모 아래 새 id로 재생성하는 것은 허용한다 |
| 미분류 요청 오류 | 위 목록에 없는 요청 형식 오류(필수 필드 누락, DB 제약 위반 등)는 `400 VALIDATION_ERROR`로 응답한다 — 원시 500이 노출되지 않도록 하는 안전망이며 개별 도메인 규칙을 대체하지 않는다 |

## 2. DB 테이블 설계

`users` 테이블은 인증 설계 문서 소관이므로 이 문서에서는 정의하지 않는다.

### check_ins

| 컬럼 | 타입 | 제약 | 설명 |
|---|---|---|---|
| id | uuid | PK | 클라이언트 생성 UUID |
| user_id | uuid | NOT NULL, FK → users.id | |
| latitude | double precision | NOT NULL | |
| longitude | double precision | NOT NULL | |
| accuracy_m | double precision | NOT NULL, CHECK (accuracy_m >= 0) | |
| captured_at | timestamptz | NOT NULL | GPS 좌표 획득 시각 |
| checked_in_at | timestamptz | NOT NULL | 사용자 확정 시각 |
| created_at | timestamptz | NOT NULL | 클라이언트가 로컬에 최초 생성한 시각(클라이언트 공급값) |
| deleted_at | timestamptz | NULL | soft delete |

인덱스: `(user_id, checked_in_at)` — 오늘/캘린더 날짜 범위 조회. `(user_id) WHERE deleted_at IS NULL` — 활성 레코드 스캔.

### check_in_notes

| 컬럼 | 타입 | 제약 | 설명 |
|---|---|---|---|
| id | uuid | PK | |
| check_in_id | uuid | NOT NULL, FK → check_ins.id | 1:1 원칙이지만 컬럼 자체는 하드 UNIQUE가 아님(아래 설명) |
| body | text | NOT NULL | 길이 제한은 DB CHECK 대신 API 계층에서 검증(정책 변경 시 마이그레이션 불필요) |
| updated_at | timestamptz | NOT NULL | |
| deleted_at | timestamptz | NULL | |

제약: `check_in_id`에 하드 UNIQUE를 두지 않는다. 대신 부분 유니크 인덱스 `UNIQUE (check_in_id) WHERE deleted_at IS NULL`로 "체크인당 활성 메모는 1개"(FR-M2-01)만 강제한다. 하드 UNIQUE로 두면 메모를 삭제한 뒤 같은 체크인에 새 메모(새 id)를 추가하려 할 때 소프트 삭제된 기존 행과 유니크 제약이 충돌해 실패한다 — `daily_reflections`·`photo_attachments`와 동일한 이유로 부분 인덱스를 쓴다.

### daily_reflections

| 컬럼 | 타입 | 제약 | 설명 |
|---|---|---|---|
| id | uuid | PK | |
| user_id | uuid | NOT NULL, FK → users.id | |
| date | date | NOT NULL | 사용자 기기 타임존 기준 로컬 날짜 |
| body | text | NOT NULL | |
| updated_at | timestamptz | NOT NULL | |
| deleted_at | timestamptz | NULL | |

제약: `UNIQUE (user_id, date) WHERE deleted_at IS NULL` — 날짜당 활성 회고 하나(FR-M2-02). 삭제된 행은 유니크 대상에서 제외해 같은 날짜 재작성을 허용한다.

인덱스: `(user_id, date)`.

### photo_attachments

| 컬럼 | 타입 | 제약 | 설명 |
|---|---|---|---|
| id | uuid | PK | 첨부 UUID |
| check_in_id | uuid | NOT NULL, FK → check_ins.id | 1:1 원칙이지만 컬럼 자체는 하드 UNIQUE가 아님(아래 설명) |
| object_key | text | NOT NULL | 객체 스토리지 경로 |
| content_type | text | NOT NULL | 허용 MIME 목록은 API 계층 정책(3절) |
| size_bytes | bigint | NOT NULL, CHECK (size_bytes > 0) | |
| checksum | text | NOT NULL | sha256 hex |
| status | text | NOT NULL DEFAULT 'uploading', CHECK IN ('uploading','ready','deleted') | |
| created_at | timestamptz | NOT NULL | |
| ready_at | timestamptz | NULL | |
| deleted_at | timestamptz | NULL | |

제약: `check_in_id`에 하드 UNIQUE를 두지 않는다. 대신 부분 유니크 인덱스 `UNIQUE (check_in_id) WHERE status = 'ready' AND deleted_at IS NULL`로 "동시에 활성인 대표 사진은 1장"만 강제한다. 사진 교체 흐름(참조 문서 §2)에서는 새 사진이 `ready`로 확인되기 전까지 기존 `ready` 사진을 유지해야 하므로, 교체 중에는 (기존 `ready` 행 + 신규 `uploading` 행)이 같은 `check_in_id`에 일시적으로 공존한다. 하드 UNIQUE는 이 흐름과 모순되므로 부분 인덱스로 대체한다.

인덱스: `(status, created_at) WHERE status = 'uploading'` — 24시간 초과 `uploading` 정리 작업(참조 문서 §7)용.

### sync_change_log

| 컬럼 | 타입 | 제약 | 설명 |
|---|---|---|---|
| seq | bigserial | PK | |
| user_id | uuid | NOT NULL | |
| entity_type | text | NOT NULL, CHECK IN ('check_in','check_in_note','daily_reflection','photo_attachment') | |
| entity_id | uuid | NOT NULL | 의도적으로 FK 없음 — 사진 메타데이터는 30일 후 물리 삭제되므로(참조 문서 §4) 로그가 현재 엔터티 상태에 의존하면 안 된다 |
| operation | text | NOT NULL, CHECK IN ('create','update','delete') | |
| payload | jsonb | NULL | delete 시 NULL 허용. 사진 바이너리는 제외한 메타데이터 스냅샷만 저장 |
| occurred_at | timestamptz | NOT NULL DEFAULT now() | |

인덱스: `(user_id, seq)` — 커서 페이지네이션(`WHERE user_id = ? AND seq > ? ORDER BY seq`).

## 3. API 계약

별도로 명시하지 않는 한, 모든 DELETE 엔드포인트는 이미 삭제된 리소스에 대해서도 오류 없이 `200`으로 응답한다(NFR-05 멱등성).

### 체크인 — 생성 전용(편집 불가)

```
PUT /v1/check-ins/{id}
```
요청: `{ latitude, longitude, accuracyM, capturedAt, checkedInAt, createdAt }`
응답: `200` + 저장된 리소스 표현. 신규/재시도 구분 없이 항상 `200`(멱등 upsert이므로 클라이언트가 상태 코드로 분기할 필요 없음).

체크인은 생성 후 좌표·시각 편집이 불가(FR-M1-02)하므로, 동일 `id`에 **다른 값**이 재전송되면 `409 CHECK_IN_IMMUTABLE`. 완전히 동일한 payload 재전송(순수 재시도)은 `200`으로 무시한다. 동일 `id`가 다른 사용자 소유로 이미 존재하면 `404 CHECK_IN_NOT_FOUND`(소유권 마스킹, 1절).

```
DELETE /v1/check-ins/{id}
```
요청: `{ deletedAt }` → `200`(이미 삭제됐어도 `200` — 멱등, NFR-05).

### 메모 / 회고 — 편집 가능, last-write-wins

```
PUT /v1/check-in-notes/{id}
```
요청: `{ checkInId, body, updatedAt }` → `200`.
- 부모 체크인이 없음: `404 CHECK_IN_NOT_FOUND`
- 부모 체크인이 삭제됨: `409 CHECK_IN_DELETED`
- 동일 `id`가 다른 사용자 소유 메모로 이미 존재함: `404 CHECK_IN_NOTE_NOT_FOUND`
- 동일 `id`가 이미 삭제된 메모임: `409 CHECK_IN_NOTE_DELETED` — 삭제는 종단 상태이며, 새 메모가 필요하면 새 `id`로 요청한다
- 들어온 `updatedAt`이 저장된 값보다 오래됨: 조용히 무시하고 현재 저장값으로 `200` 반환(참조 문서 §5.3 last-write-wins)

```
DELETE /v1/check-in-notes/{id}
```
요청: `{ deletedAt }` → `200`.

```
PUT /v1/daily-reflections/{id}
```
요청: `{ date, body, updatedAt }` → `200`.
- 같은 `date`를 다른 `id`(활성 상태)가 이미 점유: `409 REFLECTION_DATE_CONFLICT`
- 동일 `id`가 다른 사용자 소유 회고로 이미 존재함: `404 REFLECTION_NOT_FOUND`
- 동일 `id`가 이미 삭제된 회고임: `409 REFLECTION_DELETED` — 삭제는 종단 상태이며, 새 회고가 필요하면 새 `id`로 요청한다

```
DELETE /v1/daily-reflections/{id}
```
요청: `{ deletedAt }` → `200`.

### 사진 — presigned 3단계

```
POST /v1/photo-attachments
```
요청: `{ id, checkInId, contentType, sizeBytes, checksum }`
응답 `201`: `{ id, checkInId, uploadUrl, uploadExpiresAt, status: "uploading" }`
- 부모 체크인 없음: `404 CHECK_IN_NOT_FOUND` · 삭제됨: `409 CHECK_IN_DELETED`
- 동일 `id`가 다른 사용자 소유 첨부로 이미 존재함: `404 PHOTO_NOT_FOUND`
- 동일 `id`(본인 소유) 재요청 시 상태가 `uploading`이면 새 presigned URL을 재발급(멱등). `ready`/`deleted`면 `409 PHOTO_ALREADY_FINALIZED`
- 기존 `ready` 사진이 있어도 이 요청은 정상 허용(교체 시작)

```
POST /v1/photo-attachments/{id}/complete
```
요청: `{}` (서버가 스토리지에서 실재·크기·체크섬 검증)
응답 `200`: `{ id, status: "ready", readyAt }`
- 이미 `ready`인 동일 요청 재시도: `200`으로 그대로 반환(멱등)
- 검증 실패(실재/크기/체크섬 불일치): `409 VERIFICATION_FAILED`
- 이미 `deleted`: `409 PHOTO_ALREADY_FINALIZED`
- 부수 효과: 같은 `check_in_id`의 기존 `ready` 행이 있으면 이 시점에 `deleted`로 전환(교체 완료)

```
DELETE /v1/photo-attachments/{id}
```
요청: `{}` → `200`(이미 삭제됐어도 `200`, 멱등) — 객체 스토리지 파일 즉시 삭제, `status` → `deleted`.

### 복원 — 통합 pull

```
GET /v1/sync/changes?cursor={seq}&limit=200
```
응답 `200`: `{ changes: [{ seq, entityType, entityId, operation, payload, occurredAt }], nextCursor }`
- 인증된 사용자 본인(`user_id`)의 변경 로그만 반환한다(NFR-06)
- `changes`가 비어있으면 `nextCursor == cursor`(caught up을 의미)
- 잘못된 `cursor`: `400 VALIDATION_ERROR`

## 4. 변경 이력

| 날짜 | 변경 |
|---|---|
| 2026-08-16 | 최초 작성. 동기화 도메인(체크인·메모·회고·사진 첨부) DB 테이블과 API 계약 정의. 인증·클라이언트 SQLite 스키마는 범위 제외 |
| 2026-08-16 | 구현·최종 리뷰 과정에서 발견된 격차 반영. `check_in_notes.check_in_id`를 하드 UNIQUE에서 부분 유니크 인덱스(`WHERE deleted_at IS NULL`)로 변경 — 메모 삭제 후 같은 체크인에 새 메모를 추가하는 흐름이 유니크 위반으로 실패하던 문제를 해결. 소유권 마스킹(`{ENTITY}_NOT_FOUND`)과 삭제된 리소스 재작성 거부(`{ENTITY}_DELETED`) 규칙을 1절 공통 규약으로 승격하고, 실제 구현에서 쓰이는 `CHECK_IN_NOTE_NOT_FOUND`/`CHECK_IN_NOTE_DELETED`/`REFLECTION_DELETED`/`PHOTO_NOT_FOUND`를 각 엔드포인트에 명시. 미분류 요청 오류(`VALIDATION_ERROR`)를 공통 규약에 추가 |
