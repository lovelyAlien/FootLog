# FootLog 서버 동기화·사진 백업·기기 전환 설계

- 작성일: 2026-08-14
- 상태: 승인됨
- 관계: `2026-08-06-core-ux-flow-design.md`의 "10. 아키텍처 영향"을 구체화. `docs/product/footlog-prd.md`의 FR-M3-01~04 수용 기준을 충족하는 구현 방식을 정의.
- 우선순위: 제품 범위와 수용 기준은 PRD를 우선한다. 이 문서는 그 수용 기준을 만족하는 아키텍처·DB·API 설계만 다룬다.

## 1. 배경과 범위

M1~M2는 로그인 없는 로컬 사용자로 동작한다. M3부터 카카오 로그인, 서버 동기화, 사진 백업, 새 기기 복원이 추가된다. 이 문서는 다음 네 가지를 다룬다.

1. 사진 서버 백업 방식
2. 새 기기 로그인 시 기존 세션 처리
3. 사진 삭제 시 파일 보존 기간
4. 체크인·메모·회고·사진의 서버 동기화 아키텍처와 DB 구조

인증 자체(카카오 OAuth 검증 절차)와 계정 삭제(FR-M3-04)의 상세 흐름은 이 문서 범위 밖이며, 별도 설계에서 다룬다.

## 2. 사진 서버 백업 — 사전 서명 URL 직접 업로드

FootLog 서버는 사진 바이너리를 직접 받지 않는다. 서버는 업로드 권한(사전 서명 URL)만 발급하고, 앱이 객체 스토리지에 직접 업로드한다.

```
1. 체크인 확정 → SQLite 저장 → 서버 동기화 시도 (사진과 무관하게 먼저 완료)
2. 사진 선택 → 리사이즈·압축·EXIF 위치정보 제거 → 로컬 저장, 첨부 UUID 생성
3. 부모 체크인이 서버에 존재해야 사진 업로드 가능 (체크인 동기화 실패 시 사진은 로컬 대기)
4. POST /v1/photo-attachments → 서버가 소유권·중복·형식 검증 후 사전 서명 URL 발급
5. 앱 → 객체 스토리지에 PUT으로 직접 업로드
6. POST /v1/photo-attachments/{id}/complete → 서버가 스토리지에서 실재/크기/체크섬 검증 후 ready 전환
```

**실패 처리**

| 실패 지점 | 처리 |
|---|---|
| URL 발급 요청 실패 | 로컬 `pending` 유지, 체크인은 영향 없음, 재시도 |
| 객체 스토리지 업로드 실패/URL 만료 | 새 사전 서명 URL 재발급 후 재시도. 만료된 URL 재사용 금지 |
| 업로드 성공, complete 요청 실패 | 같은 첨부 UUID로 complete 재요청 (멱등) |
| 오래 `uploading` 상태로 남은 첨부 | 서버 정리 작업이 24시간 초과 시 객체·메타데이터 정리. 로컬에 원본이 남아 있으면 다음 동기화에서 재업로드 |

**사진 교체**: 새 사진이 `ready` 확인된 후에만 서버에서 현재 사진으로 전환하고 기존 사진을 삭제 대상으로 표시한다. 새 사진 업로드가 실패하면 기존 사진이 계속 표시된다. 체크인당 활성 사진은 항상 1장이다.

## 3. 새 기기 로그인 — 후입 기기 우선

```
기기 A 로그인 상태
→ 기기 B에서 카카오 인증 성공
→ 서버가 409로 "다른 기기 사용 중" 응답 (POST /v1/auth/kakao)
→ B에서 전환 확인 (POST /v1/auth/kakao/confirm-switch)
→ B 세션 발급, A 세션 즉시 폐기
```

- 기존 기기(A)의 승인은 요구하지 않는다. 휴대폰 분실 등으로 A에 접근할 수 없어도 B에서 카카오 인증과 전환 확인만으로 사용을 재개할 수 있다.
- B에는 "다른 기기에서 FootLog를 사용 중입니다. 이 기기에서 계속하면 기존 기기에서 로그아웃되며, 기존 기기의 백업되지 않은 기록은 자동으로 이전되지 않습니다."를 안내하고 취소/계속 중 선택하게 한다.
- A의 로컬 기록은 삭제하지 않는다. A가 온라인으로 돌아오면 미동기화 기록 수를 표시하고 추가 체크인·서버 접근은 차단하며, 재로그인해야 해당 기록을 동기화할 수 있다.

## 4. 사진 삭제 — 즉시 파일 삭제, 메타데이터 30일 보존

- 사진 삭제 요청 시 객체 스토리지의 파일은 즉시 제거한다. 파일 자체에는 유예 기간을 두지 않는다.
- `photo_attachments` 행은 `deleted_at`만 채운 채 30일 유지하여, 재연결하는 다른 기기가 `sync_change_log`를 통해 삭제 사실을 확실히 전달받게 한다. 30일이 지나면 정리 작업이 메타데이터 행을 물리적으로 삭제한다 — 이미 `sync_change_log`에 `delete` 이벤트가 영구 기록되어 있으므로 메타데이터 행이 사라져도 복원 흐름에는 영향이 없다.
- 사용자에게 노출되는 삭제 복구 기능은 제공하지 않는다.
- 체크인·메모·회고의 `deleted_at`은 물리적 삭제 없이 유지한다. 텍스트 레코드는 저장 비용이 무시할 수준이라 정리 작업이 필요 없고, 사진만 개인정보·저장 비용을 이유로 파일을 즉시 제거한다.

## 5. 동기화 아키텍처 — 엔터티별 쓰기 API + 커서 기반 변경 로그

```
로컬 SQLite                          Spring Boot                    PostgreSQL/PostGIS + 객체 스토리지
  check_ins            ──PUT/DELETE──▶  체크인 API        ──────▶     check_ins
  check_in_notes        ──PUT/DELETE──▶  메모 API           ──────▶     check_in_notes
  daily_reflections    ──PUT/DELETE──▶  회고 API           ──────▶     daily_reflections
  photo_attachments    ──presigned 흐름──▶ 사진 API         ──────▶     photo_attachments + 객체 스토리지
  sync_operations(아웃박스)                                            sync_change_log (append-only)
                        ◀──GET /v1/sync/changes?cursor=...──
```

일상적인 쓰기는 엔터티별 API로 단순하게 처리하고, 서버 변경분을 내려받을 때(새 기기 복원, 재연결 후 동기화)만 통합 커서 API를 사용한다. 통합 쓰기 API나 이벤트 소싱 방식은 현재 MVP 규모에 비해 구현·운영 복잡도가 높아 채택하지 않는다.

### 5.1 PostgreSQL 스키마

```
users
  id, kakao_user_id, created_at

active_sessions
  id, user_id, device_id, session_token, issued_at, revoked_at
  -- user_id당 revoked_at IS NULL 세션은 항상 최대 1개

check_ins
  id (client UUID, PK), user_id, latitude, longitude, accuracy_m,
  captured_at, created_at, deleted_at

check_in_notes
  id (client UUID, PK), check_in_id (FK, unique), body,
  updated_at, deleted_at

daily_reflections
  id (client UUID, PK), user_id, date, body,
  updated_at, deleted_at

photo_attachments
  id (client UUID, PK), check_in_id (FK, unique), object_key,
  content_type, size_bytes, checksum,
  status (uploading | ready | deleted),
  created_at, ready_at, deleted_at

sync_change_log
  seq (bigserial, PK), user_id, entity_type, entity_id,
  operation (create | update | delete), payload (jsonb, nullable),
  occurred_at
```

`sync_change_log`는 각 엔터티 쓰기와 같은 트랜잭션으로 기록된다. 텍스트 계열(체크인·메모·회고)과 사진 메타데이터는 `payload`에 스냅샷을 통째로 저장한다(사진 바이너리는 제외). 로그는 append-only이며, 같은 엔터티가 다시 수정되면 기존 행을 고치지 않고 새 seq로 최신 payload를 가진 행을 추가한다. 클라이언트가 seq 순서대로 적용하면 최종 상태는 자동으로 최신 payload로 수렴하므로 별도의 병합 로직이 필요 없다.

연쇄 삭제(체크인 삭제 시 연결된 메모·사진도 삭제)는 각각 개별 `delete` 로그 행으로 남긴다. 예를 들어 체크인 하나를 삭제하면 사진 삭제, 메모 삭제, 체크인 삭제 순으로 3개의 행이 별도로 쌓인다. 이렇게 하면 클라이언트는 로그에 적힌 대로만 반영하면 되고, 서버의 연쇄 삭제 규칙(예: 사진 보존 정책 변경)이 나중에 바뀌어도 클라이언트 코드를 서버 규칙과 별개로 유지할 수 있다.

### 5.2 API 목록

**쓰기 (클라이언트 UUID 기준 멱등 upsert)**
```
PUT    /v1/check-ins/{id}
DELETE /v1/check-ins/{id}
PUT    /v1/check-in-notes/{id}
DELETE /v1/check-in-notes/{id}
PUT    /v1/daily-reflections/{id}
DELETE /v1/daily-reflections/{id}
```

**사진**
```
POST   /v1/photo-attachments                 -- 사전 서명 URL 발급
POST   /v1/photo-attachments/{id}/complete   -- 업로드 확정
DELETE /v1/photo-attachments/{id}            -- 즉시 삭제
```

**복원 (통합 pull)**
```
GET /v1/sync/changes?cursor={seq}&limit=200
→ { changes: [{seq, entityType, entityId, operation, payload, occurredAt}, ...], nextCursor }
```

**인증/기기 전환**
```
POST /v1/auth/kakao                 -- 카카오 토큰 검증. 활성 세션 충돌 시 409 + 활성 기기 정보 반환
POST /v1/auth/kakao/confirm-switch  -- 전환 확인 후 새 세션 발급, 기존 세션 폐기
```

각 쓰기 API는 서버가 클라이언트 UUID로 upsert하며, 요청 재전송(네트워크 재시도)에 대해 멱등하다.

### 5.3 충돌 해결 — last-write-wins

체크인은 생성 후 위치·시각을 편집할 수 없고 삭제만 가능하다. 편집 가능한 것은 메모·회고·사진뿐이다. 후입 기기 우선 정책상 한 시점에 쓰기가 가능한 기기는 항상 하나이므로 진짜 동시 편집 충돌은 발생하지 않는다. 서버는 `updated_at` 비교만으로 오래된 재전송을 걸러내면 되고, 버전 벡터나 별도 병합 로직은 두지 않는다.

### 5.4 클라이언트 로컬 아웃박스

```
sync_operations (SQLite)
  id, entity_type, entity_id, operation,
  attempt_count, last_attempted_at, status (pending|in_flight|failed), created_at
```

각 엔터티 쓰기는 로컬 저장과 동시에 이 큐에 적재되고, 동기화 워커가 순서대로 전송한다. 사진 항목은 `presigned URL 발급 → 업로드 → complete`의 3단계 상태를 추가로 가진다. 한 엔터티 종류의 실패가 다른 종류의 동기화를 막지 않는다.

## 6. 새 기기 복원 흐름 (FR-M3-03)

1. 로그인 성공 후 `GET /v1/sync/changes?cursor=0`을 반복 호출하여 텍스트 계열(체크인·메모·회고)과 사진 메타데이터를 먼저 복원한다.
2. 사진 파일은 화면에서 필요할 때(썸네일 노출 시점) `object_key` 기준으로 내려받는다.
3. 복원 중 실패한 항목은 재시도할 수 있고, 이미 복원된 항목(같은 `entity_id`)은 중복 생성되지 않는다.
4. 마지막으로 처리한 `nextCursor`를 로컬에 저장해 다음 pull의 시작점으로 사용한다.

## 7. 테스트 초점

- 체크인 동기화 실패가 사진 업로드를 막지 않는지, 반대로도 마찬가지인지
- 사전 서명 URL 만료/재발급, complete 재시도 멱등성
- 24시간 초과 `uploading` 첨부 정리 작업
- 사진 교체 시 새 사진 `ready` 확인 전까지 기존 사진 유지
- 기기 전환 시 A 세션 즉시 폐기, A의 로컬 미동기화 기록 보존
- 사진 즉시 삭제 후 `deleted_at` 30일 보존과 다른 기기로의 전파
- `sync_change_log` 커서 순서 적용 시 연쇄 삭제 3건이 올바르게 반영되는지
- 새 기기 복원 시 텍스트 우선, 사진 지연 다운로드, 재시도 시 중복 생성 없음
