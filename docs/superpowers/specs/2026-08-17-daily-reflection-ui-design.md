# FootLog 일일 회고 UI 설계

- 작성일: 2026-08-17
- 상태: 승인됨
- 관계: `2026-08-06-core-ux-flow-design.md`의 5장(일일 회고)을 모바일 구현 단위로 구체화한다. `2026-08-14-server-sync-photo-backup-design.md`의 로컬 스키마·클라이언트 UUID 원칙과 정합성을 유지하되, 이 문서는 서버 동기화 없이 로컬 전용으로 동작하는 범위만 다룬다.
- 우선순위: 프론트 구현은 여러 슬라이스로 나눠 진행하며, 이 문서는 "일일 회고 UI" 슬라이스(캘린더 탭 + 회고 상세 화면)만 다룬다. 나머지 슬라이스(서버 동기화, 사진·메모 첨부, 회고 알림, 주간 발견)는 이 문서 범위 밖이며 각각 별도 설계에서 다룬다.

## 1. 배경과 범위

현재 모바일 구현은 로컬 체크인(오늘 탭, 알림 설정, SQLite 저장)까지만 있고, 캘린더 탭과 발견 탭은 스텁 상태다. 백엔드에는 체크인·메모·회고·사진 API와 동기화 커서 API가 이미 구현되어 있지만, 실제 카카오 로그인(`POST /v1/auth/kakao`)은 아직 없어 모바일에서 서버 동기화를 시작할 수 없는 상태다.

이 문서는 서버 동기화·인증 없이도 독립적으로 가치를 낼 수 있는 조각으로, 이미 로컬에 쌓인 체크인 데이터를 지도·타임라인·요약으로 돌아보고 날짜별 회고 본문을 작성하는 기능을 다룬다.

### 포함

- 캘린더 탭: 월간 날짜 그리드, 체크인 있는 날짜 표시, 날짜 선택 시 회고 상세 화면으로 이동
- 회고 상세 화면(`app/day/[date].tsx`): 지도(체크인 핀 + 시간순 연결선) + 시간별 타임라인 + 하루 요약(사실 기반) + 회고 본문 작성·수정
- 체크인 없는 날의 빈 상태
- 기존에 구현된 활동 시간대(`startHour`/`endHour`)를 이용한 타임라인 빈 슬롯 표시
- 체크인 완료 화면의 "오늘의 발자국 보기" 버튼을 오늘 날짜 회고 상세 화면으로 연결

### 제외 (후속 슬라이스)

- 서버 동기화 (회고는 로컬 SQLite에만 저장, 카카오 로그인·백엔드 API 연동 없음)
- 사진·메모 첨부 및 표시 (모바일에 체크인 노트·사진 도메인이 아직 없음)
- 좌우 스와이프로 날짜 이동 (이번 슬라이스는 캘린더 그리드에서 날짜 선택만 지원)
- 회고 알림 예약 (핵심 UX 설계 6장)
- 체크인 삭제 흐름
- 주간 발견 (핵심 UX 설계 7장) — 단, 3장의 공간 군집 로직은 이 슬라이스에서 공용 모듈로 미리 분리해 재사용 준비만 해둔다

## 2. 데이터 모델

기존 `check_ins` 테이블은 서버 동기화 이전 단계라 하드 삭제(`DELETE FROM check_ins WHERE id = ?`, [SQLiteCheckInRepository.ts](../../../mobile/src/features/check-in/SQLiteCheckInRepository.ts))를 쓰고 있다. 동기화가 아직 없는 로컬 전용 데이터에 `deleted_at` 같은 tombstone 컬럼을 미리 두는 것은 이 시점엔 불필요한 선작업이다 — 삭제된 기록을 서버에 전달해야 할 큐(outbox)가 아직 존재하지 않기 때문이다. 회고 테이블도 같은 컨벤션을 따라 하드 삭제로 시작한다. 서버 동기화 슬라이스가 들어올 때, 삭제 전파는 로컬 tombstone이 아니라 `2026-08-14-server-sync-photo-backup-design.md` 5.4절에 정의된 `sync_operations` 아웃박스 큐로 처리할 가능성이 높다.

`mobile/src/database/migrate.ts`에 버전 2 마이그레이션을 추가한다.

```sql
CREATE TABLE IF NOT EXISTS daily_reflections (
  id TEXT PRIMARY KEY NOT NULL,
  local_date TEXT NOT NULL UNIQUE,
  body TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS daily_reflection_drafts (
  local_date TEXT PRIMARY KEY NOT NULL,
  body TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
PRAGMA user_version = 2;
```

- `daily_reflections.id`는 클라이언트 UUID다. 지금 당장 동기화하지 않지만, 백엔드 `DailyReflection` 스키마(`id`, `date`, `body`, `updated_at`, `deleted_at`)와 필드를 맞춰 두어 나중에 동기화 슬라이스가 그대로 매핑할 수 있게 한다.
- `local_date`에 `UNIQUE` 제약을 걸어 `INSERT ... ON CONFLICT(local_date) DO UPDATE`로 upsert한다 (기존 `AppSettingsRepository`와 동일한 패턴).
- `daily_reflection_drafts`는 날짜당 임시 본문 1개만 유지한다. 사용자가 "완료"를 누르면 `daily_reflections`로 커밋하고 draft 행을 삭제한다.

`src/features/daily-reflection/domain.ts`:

```ts
export type DailyReflection = {
  id: string;
  localDate: string;   // YYYY-MM-DD
  body: string;
  updatedAt: string;
};

export interface DailyReflectionRepository {
  getByLocalDate(localDate: string): Promise<DailyReflection | null>;
  save(reflection: DailyReflection): Promise<void>;       // upsert by local_date
  deleteByLocalDate(localDate: string): Promise<void>;
}

export interface DailyReflectionDraftRepository {
  getDraft(localDate: string): Promise<string | null>;
  saveDraft(localDate: string, body: string): Promise<void>;
  clearDraft(localDate: string): Promise<void>;
}
```

`save()`는 `createCheckIn.ts`와 동일한 의존성 주입 패턴(`uuid: () => string`, `now: () => string`)으로 감싼다. 기존 회고가 있으면 그 `id`를 유지하고, 없으면 새로 발급한다.

또한 캘린더 탭의 월간 점(dot) 표시를 위해 `CheckInRepository`에 메서드를 추가한다.

```ts
listLocalDatesWithCheckIns(year: number, month: number, timezone: string): Promise<string[]>;
```

`month`는 1~12 범위의 1-indexed 값이다(`local_date` 문자열의 월 부분과 동일한 규칙). 전체 체크인 레코드를 불러오지 않고 해당 월에 체크인이 존재하는 날짜(`YYYY-MM-DD`) 목록만 반환한다.

## 3. 공용 지오메트리 모듈과 하루 요약 계산

Haversine 거리 계산과 200m 근접 클러스터링은 "회고"라는 개념과 무관한 순수 지오메트리 로직이며, 핵심 UX 설계 7.1절이 정의한 `영역`(서로 200m 이내인 체크인을 묶은 공간 군집) 개념은 주간 발견 기능에서도 동일하게 재사용된다. 따라서 `daily-reflection` 기능 모듈이 아니라 신규 공용 모듈 `src/shared/geo.ts`에 둔다.

```ts
// src/shared/geo.ts
export function haversineDistanceMeters(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
): number

export function clusterByProximity<T extends { latitude: number; longitude: number }>(
  points: T[],
  thresholdMeters: number,
): T[][]  // 시간순 입력을 유지한 채, 인접 거리가 threshold 이내인 것끼리 묶은 연속 그룹 배열
```

`src/features/daily-reflection/dailySummary.ts`는 이 두 함수를 소비하기만 하고 클러스터링 알고리즘 자체는 모른다.

```ts
export type DailySummary = {
  checkInCount: number;
  firstCheckedInAt: string | null;
  lastCheckedInAt: string | null;
  approximateDistanceMeters: number;
  longestConsecutiveArea: {
    startedAt: string;
    endedAt: string;
    checkInIds: string[];
  } | null;
};

export function computeDailySummary(checkIns: CheckIn[]): DailySummary
```

**계산 방식**

- **체크인 개수**: `checkIns.length`
- **첫/마지막 체크인 시각**: 시간순 정렬 후 양 끝
- **대략적인 이동 거리**: 시간순으로 인접한 체크인 쌍마다 `haversineDistanceMeters`로 거리를 구해 합산
- **가장 오래 연속으로 체크인된 지도 영역**: `clusterByProximity(checkIns, 200)`로 나온 연속 구간들 중, 시작~끝 시간 길이가 가장 긴 구간을 선택. 그 구간의 시작 시각·종료 시각·포함된 체크인 id 목록을 반환
- **정확도 필터링**: `accuracyM > 200`인 체크인은 `clusterByProximity` 입력에서 제외한다(지도·타임라인에는 그대로 표시, 이 계산에서만 제외). 핵심 UX 설계 7.1절이 주간 발견에서 동일한 이유로 명시한 규칙과 맞춘다 — 정확도가 나쁜 점 하나가 거리 계산을 왜곡해 잘못된 연속 영역을 만들 수 있기 때문이다.

**예시**: 하루 7개 체크인(07:00 집, 09:00 회사, 10:00 회사 앞 카페, 11:00 회사, 12:00 회사, 15:00 마트, 18:00 집)이 있고 인접 거리가 각각 약 1,200m / 80m / 80m / 15m / 900m / 650m라면, 200m 이내로 묶이는 구간은 `[07:00]`, `[09:00, 10:00, 11:00, 12:00]`, `[15:00]`, `[18:00]` 네 개가 생긴다. 이 중 09:00~12:00(3시간, 체크인 4개) 구간이 가장 길어 `longestConsecutiveArea`로 선택된다. `approximateDistanceMeters`는 여섯 구간 거리의 합인 약 2,925m다.

체크인이 0개면 `checkInCount: 0`, 나머지 필드는 `null`이다.

## 4. 화면 구성과 네비게이션

화면은 두 개다.

```
[캘린더 탭]                          [회고 상세 화면] (신규 라우트)
                날짜 선택
   월간 그리드   ──────────▶   app/day/[date].tsx
   (날짜 칸 누르면 이동)         지도 + 타임라인 + 하루 요약 + 회고 본문
```

### 4.1 캘린더 탭 (`app/(tabs)/calendar.tsx`)

- 스텁을 월간 그리드로 재작성한다. 이전/다음 달 이동 버튼을 둔다.
- 표시 중인 달에 대해 `listLocalDatesWithCheckIns()`를 조회해 체크인이 있는 날짜 칸에 점을 표시한다.
- 날짜 칸을 누르면 `router.push('/day/${localDate}')`로 이동한다. 이 화면 자체는 지도·타임라인·회고를 렌더링하지 않는다(날짜 선택만 담당).

### 4.2 회고 상세 화면 (`app/day/[date].tsx`, 신규)

핵심 UX 설계 5.1절 구조를 그대로 따른다.

```
날짜 · 체크인 수
지도 (체크인 핀 + 시간순 연결선, 선택된 핀 강조)
하루 요약 (개수 / 첫·마지막 시각 / 이동 거리 / 최장 연속 영역)
시간별 타임라인 (활동 시간대 startHour~endHour 슬롯, 체크인 있는 슬롯만 채움)
회고 본문 (TextInput, 미완료 상태면 "완료" 버튼, 완료 후엔 바로 저장되는 수정 모드)
```

- **핀 ↔ 타임라인 선택 연동**: 화면 로컬 상태 `selectedCheckInId`를 지도 마커 `onPress`와 타임라인 항목 `onPress`가 공유한다. 어느 쪽을 눌러도 같은 상태가 갱신되고 양쪽 다 하이라이트된다.
- **연결선**: `Polyline`으로 시간순 좌표를 잇되, "실제 이동 경로가 아니라 기록 지점을 시간순으로 연결한 선"이라는 문구를 지도 하단에 고정 표시한다.
- **회고 본문 자동 임시 저장**: `TextInput onChangeText` → 디바운스(500ms) 후 `draftRepository.saveDraft()` 호출. 화면 진입 시 `daily_reflections`에 완료된 본문이 있으면 그것을 우선 표시하고, 없으면 draft를 표시한다.
- **완료 버튼**: `reflectionRepository.save()` 호출 후 draft를 삭제한다. 이미 완료된 회고를 수정 중이면 별도 완료 버튼 없이, `TextInput onChangeText`가 동일하게 500ms 디바운스 후 `reflectionRepository.save()`를 직접 호출해 갱신한다(draft 테이블은 거치지 않는다) — 핵심 UX 설계: "저장 후에도 수정하거나 삭제할 수 있다".
- **빈 상태**: 해당 날짜 체크인이 0개면 지도·타임라인·요약 블록만 "이날은 남겨진 발자국이 없어요" 메시지로 대체된다. 회고 본문 편집기는 그 아래 그대로 남아 체크인 유무와 무관하게 계속 노출된다(핵심 UX 설계상 회고와 체크인 기록은 서로 독립적으로 다뤄짐).

### 4.3 "오늘의 발자국 보기" 연결 변경

[check-in.tsx](../../../mobile/app/check-in.tsx)의 `onViewToday`는 현재 `router.replace('/')`(오늘 탭)로 이동한다. 이를 `router.replace('/day/${오늘 날짜}')`로 변경해, 체크인 완료 직후 바로 회고 상세 화면(지도+타임라인)으로 진입하게 한다.

## 5. 로딩·에러 처리

기존 `TodayRoute`([index.tsx](../../../mobile/app/(tabs)/index.tsx))가 쓰는 `isLoading`/`hasError` 패턴을 그대로 따른다.

**회고 상세 화면 진입 시**

- 진입 즉시 `repository.listByLocalDay()`, `reflectionRepository.getByLocalDate()`, `draftRepository.getDraft()` 세 조회를 병렬로 실행한다.
- 로딩 중: "이날의 기록을 불러오는 중이에요" 중앙 메시지.
- 조회 실패: "이날의 기록을 불러오지 못했어요" + 다시 시도 버튼.
- 세 조회 중 하나라도 실패하면 화면 전체를 에러로 취급한다. 지도만 있고 회고는 없는 식의 부분 렌더링은 하지 않는다.

**회고 저장 실패**

- "완료" 버튼으로 `reflectionRepository.save()`를 호출했는데 실패하면, 버튼 아래 인라인 메시지 "회고를 저장하지 못했어요. 다시 시도해 주세요"를 표시한다. 입력한 본문은 화면 상태에 그대로 유지하고, 버튼을 다시 누르면 재시도한다.
- draft 자동 저장 실패는 조용히 무시하고 다음 디바운스 사이클에 재시도한다. 타이핑 도중 실패마다 알림을 띄우면 방해가 되고, 완료 시점에 최종적으로 한 번 더 저장을 시도하기 때문이다.

**캘린더 탭 점 조회 실패**

- 그리드 자체는 그대로 보여주되 점 표시만 생략한다. 달력 탐색 자체를 막지 않는다.

## 6. 테스트 초점

**공용 지오메트리 (`src/shared/geo.ts`)**
- `haversineDistanceMeters`: 같은 좌표 → 0, 알려진 두 좌표 쌍의 실측 거리와 근사치 비교
- `clusterByProximity`: 경계값(정확히 200m일 때 포함 여부), 점 1개, 모든 점이 같은 위치, 모든 점이 서로 멀어서 각자 단독 그룹이 되는 경우

**하루 요약 (`dailySummary.ts`)**
- 체크인 0개 → 모든 필드 null/0
- 체크인 1개 → 이동 거리 0, `longestConsecutiveArea`가 그 체크인 하나만 포함
- 여러 구간 중 가장 긴 구간이 올바르게 선택되는지 (3장 예시 시나리오를 테스트 케이스화)
- 정확도 200m 초과 체크인이 클러스터링에서는 제외되지만 개수·거리 계산에는 포함되는지

**회고 리포지토리**
- `save()`가 같은 `local_date`에 upsert하는지(같은 id 유지)
- 존재하지 않는 날짜 조회 시 `null` 반환
- draft 저장 → 완료 시 draft 삭제 → 이후 조회 시 draft 없음

**마이그레이션 (`migrate.test.ts` 확장)**
- v1 → v2 업그레이드 시 기존 `check_ins` 데이터 보존
- 새 테이블 `daily_reflections`, `daily_reflection_drafts` 생성 확인

**회고 상세 화면**
- 체크인 없는 날 빈 상태 렌더링
- 지도 핀 선택 ↔ 타임라인 항목 선택 상태 동기화(양방향)
- 회고 본문 타이핑 → 디바운스 후 draft 저장 호출 확인(가짜 타이머 사용)
- "완료" 버튼 → 저장 성공 시 완료 상태로 전환, 실패 시 입력값 유지 + 에러 메시지
- 이미 완료된 회고가 있는 날 재진입 시 저장된 본문이 draft보다 우선 표시되는지

**캘린더 탭**
- 체크인 있는 날짜에 점 표시, 없는 날짜엔 미표시
- 날짜 칸 탭 → 해당 날짜 라우트로 이동하는 네비게이션 호출 확인
- 점 조회 실패 시에도 그리드 자체는 렌더링됨

**연결 지점**
- 체크인 완료 화면의 "오늘의 발자국 보기" → `/day/{오늘 날짜}`로 이동하는지
