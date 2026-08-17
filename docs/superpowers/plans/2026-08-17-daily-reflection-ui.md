# 일일 회고 UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 캘린더 탭(월간 날짜 그리드)과 회고 상세 화면(지도+타임라인+하루 요약+회고 본문)을 로컬 SQLite 전용으로 구현한다.

**Architecture:** 기존 `features/check-in` 모듈의 도메인 인터페이스 + SQLite 구현체 + DI 훅 패턴을 그대로 따른다. 새 `features/daily-reflection` 모듈이 회고 데이터를 다루고, 새 공용 `shared/geo.ts`·`shared/localDate.ts`가 지오메트리·날짜 포맷 로직을 소유한다. 화면은 `app/(tabs)/calendar.tsx`(날짜 선택)와 신규 동적 라우트 `app/day/[date].tsx`(상세)로 나뉜다.

**Tech Stack:** React Native (Expo, expo-router typed routes), TypeScript strict, expo-sqlite, react-native-maps, `@date-fns/tz`, Jest + `@testing-library/react-native`.

## Global Constraints

- 모바일 명령은 Node.js 24에서 실행한다 (`nvm use 24`).
- 자동 검사 순서: `npm test` → `npm run typecheck` → `npm run lint` → `npx expo-doctor` (모두 `mobile/` 디렉터리에서 실행).
- 커밋 메시지는 한글, Conventional Commits 형식(`type(scope): 설명`), `Co-Authored-By` 트레일러 금지.
- 위치 체크인 관련 명명은 "체크인"만 사용한다 ("캡처" 금지).
- 서버 동기화·인증·사진·메모·회고 알림은 이 플랜의 범위 밖이다 — 로컬 SQLite 전용으로만 구현한다.
- 기존 `check_ins` 테이블처럼 신규 회고 테이블도 tombstone(`deleted_at`) 없이 하드 삭제로 시작한다.
- 신규 의존성(외부 npm 패키지)을 추가하지 않는다 — 지오메트리·달력 그리드는 모두 순수 TypeScript로 직접 구현한다.

---

## Task 1: 공용 지오메트리 모듈

**Files:**
- Create: `mobile/src/shared/geo.ts`
- Test: `mobile/__tests__/geo.test.ts`

**Interfaces:**
- Produces: `haversineDistanceMeters(a: GeoPoint, b: GeoPoint): number`, `clusterByProximity<T extends GeoPoint>(points: T[], thresholdMeters: number): T[][]`, `type GeoPoint = { latitude: number; longitude: number }`

- [ ] **Step 1: Write the failing test**

```ts
// mobile/__tests__/geo.test.ts
import { clusterByProximity, haversineDistanceMeters } from '../src/shared/geo';

describe('haversineDistanceMeters', () => {
  it('returns 0 for identical coordinates', () => {
    const point = { latitude: 37.5665, longitude: 126.978 };
    expect(haversineDistanceMeters(point, point)).toBe(0);
  });

  it('returns the exact great-circle distance along a meridian', () => {
    const south = { latitude: 37.0, longitude: 127.0 };
    const north = { latitude: 38.0, longitude: 127.0 };

    const distance = haversineDistanceMeters(south, north);

    expect(Math.abs(distance - 111194.93)).toBeLessThan(1);
  });
});

describe('clusterByProximity', () => {
  it('returns an empty array for no points', () => {
    expect(clusterByProximity([], 200)).toEqual([]);
  });

  it('keeps a single point as its own cluster', () => {
    const point = { latitude: 37.0, longitude: 127.0 };
    expect(clusterByProximity([point], 200)).toEqual([[point]]);
  });

  it('groups points within the threshold and splits on points beyond it', () => {
    const point0 = { latitude: 37.0, longitude: 127.0 };
    const point1 = { latitude: 37.0015, longitude: 127.0 }; // ~166.79m from point0
    const point2 = { latitude: 37.004, longitude: 127.0 }; // ~277.99m from point1
    const point3 = { latitude: 37.005, longitude: 127.0 }; // ~111.19m from point2

    expect(clusterByProximity([point0, point1, point2, point3], 200)).toEqual([
      [point0, point1],
      [point2, point3],
    ]);
  });

  it('treats a point clearly under the threshold as the same cluster and clearly over as a new one', () => {
    // 199m and 201m south of the origin along a meridian — safely on either side of
    // the 200m boundary to avoid floating-point round-trip flakiness at the exact edge.
    const origin = { latitude: 37.0, longitude: 127.0 };
    const under = { latitude: 37.0 - 199 / 111194.9266, longitude: 127.0 };
    const over = { latitude: 37.0 - 201 / 111194.9266, longitude: 127.0 };

    expect(clusterByProximity([origin, under], 200)).toEqual([[origin, under]]);
    expect(clusterByProximity([origin, over], 200)).toEqual([[origin], [over]]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `mobile/`): `npx jest geo.test.ts`
Expected: FAIL with "Cannot find module '../src/shared/geo'"

- [ ] **Step 3: Write minimal implementation**

```ts
// mobile/src/shared/geo.ts
export type GeoPoint = {
  latitude: number;
  longitude: number;
};

const EARTH_RADIUS_METERS = 6371000;

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

export function haversineDistanceMeters(a: GeoPoint, b: GeoPoint): number {
  const deltaLatitude = toRadians(b.latitude - a.latitude);
  const deltaLongitude = toRadians(b.longitude - a.longitude);
  const latitudeA = toRadians(a.latitude);
  const latitudeB = toRadians(b.latitude);

  const sinDeltaLatitude = Math.sin(deltaLatitude / 2);
  const sinDeltaLongitude = Math.sin(deltaLongitude / 2);

  const h = sinDeltaLatitude * sinDeltaLatitude
    + Math.cos(latitudeA) * Math.cos(latitudeB) * sinDeltaLongitude * sinDeltaLongitude;

  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(h));
}

export function clusterByProximity<T extends GeoPoint>(points: T[], thresholdMeters: number): T[][] {
  const clusters: T[][] = [];

  for (const point of points) {
    const currentCluster = clusters[clusters.length - 1];
    const previousPoint = currentCluster?.[currentCluster.length - 1];

    if (previousPoint && haversineDistanceMeters(previousPoint, point) <= thresholdMeters) {
      currentCluster.push(point);
    } else {
      clusters.push([point]);
    }
  }

  return clusters;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest geo.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add mobile/src/shared/geo.ts mobile/__tests__/geo.test.ts
git commit -m "feat(shared): 하버사인 거리와 근접 클러스터링 유틸 추가"
```

---

## Task 2: 공용 로컬 날짜 유틸 추출

**Files:**
- Create: `mobile/src/shared/localDate.ts`
- Modify: `mobile/app/(tabs)/index.tsx`
- Test: `mobile/__tests__/localDate.test.ts`

**Interfaces:**
- Produces: `formatLocalDate(date: Date, timezone: string): string`, `localDateAndTimezone(now?: Date): { localDate: string; timezone: string }`

`app/(tabs)/index.tsx`는 현재 이 로직을 파일 내부에 private 함수로 갖고 있다([index.tsx:8-20](../../../mobile/app/(tabs)/index.tsx)). 이후 태스크(캘린더 탭, 체크인 라우트, 회고 상세 화면)가 모두 이 함수를 재사용하므로 공용 모듈로 옮긴다.

- [ ] **Step 1: Write the failing test**

```ts
// mobile/__tests__/localDate.test.ts
import { formatLocalDate, localDateAndTimezone } from '../src/shared/localDate';

describe('formatLocalDate', () => {
  it('formats a UTC instant as YYYY-MM-DD in the given timezone', () => {
    // 2026-08-14T23:30:00Z + 9h(Asia/Seoul) = 2026-08-15 local
    const date = new Date('2026-08-14T23:30:00.000Z');
    expect(formatLocalDate(date, 'Asia/Seoul')).toBe('2026-08-15');
  });

  it('rolls back a day when the timezone offset is negative', () => {
    // 2026-08-15T02:00:00Z - 5h(America/New_York) = 2026-08-14 local
    const date = new Date('2026-08-15T02:00:00.000Z');
    expect(formatLocalDate(date, 'America/New_York')).toBe('2026-08-14');
  });
});

describe('localDateAndTimezone', () => {
  it('returns a YYYY-MM-DD local date and a non-empty IANA timezone for the given instant', () => {
    const result = localDateAndTimezone(new Date('2026-08-16T12:00:00.000Z'));

    expect(result.localDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(result.timezone.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest localDate.test.ts`
Expected: FAIL with "Cannot find module '../src/shared/localDate'"

- [ ] **Step 3: Write minimal implementation**

```ts
// mobile/src/shared/localDate.ts
export function formatLocalDate(date: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return `${values.year}-${values.month}-${values.day}`;
}

export function localDateAndTimezone(now: Date = new Date()): { localDate: string; timezone: string } {
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

  return { localDate: formatLocalDate(now, timezone), timezone };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest localDate.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Update `app/(tabs)/index.tsx` to use the shared util**

Replace the private function and its call site:

```ts
// Remove from mobile/app/(tabs)/index.tsx (lines 8-20):
function localDateAndTimezone(now = new Date()): { localDate: string; timezone: string } {
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return { localDate: `${values.year}-${values.month}-${values.day}`, timezone };
}
```

Add an import at the top of `mobile/app/(tabs)/index.tsx` instead:

```ts
import { localDateAndTimezone } from '../../src/shared/localDate';
```

The rest of `app/(tabs)/index.tsx` is unchanged — `localDateAndTimezone()` is still called the same way inside `useFocusEffect`.

- [ ] **Step 6: Run the full test suite to confirm no regression**

Run: `npx jest`
Expected: PASS, including `TodayCheckIns.test.tsx` and `RootLayout.test.tsx`

- [ ] **Step 7: Commit**

```bash
git add mobile/src/shared/localDate.ts mobile/__tests__/localDate.test.ts mobile/app/\(tabs\)/index.tsx
git commit -m "refactor(shared): 로컬 날짜 포맷 유틸을 공용 모듈로 추출"
```

---

## Task 3: SQLite 마이그레이션 v2

**Files:**
- Modify: `mobile/src/database/migrate.ts`
- Modify: `mobile/__tests__/migrate.test.ts`

**Interfaces:**
- Produces: SQLite tables `daily_reflections(id, local_date, body, updated_at)`, `daily_reflection_drafts(local_date, body, updated_at)`, `PRAGMA user_version = 2`

- [ ] **Step 1: Update the migration test to cover version 2 (replaces the existing "runs twice" test)**

```ts
// mobile/__tests__/migrate.test.ts
jest.mock('expo-sqlite', () => ({
  openDatabaseAsync: jest.fn(),
}));

import { openDatabaseAsync } from 'expo-sqlite';

import { migrateDatabase } from '../src/database/migrate';
import { openFootLogDatabase } from '../src/database/openDatabase';

function createDb(userVersion: number) {
  return {
    getFirstAsync: jest.fn().mockResolvedValue({ user_version: userVersion }),
    execAsync: jest.fn(),
    withTransactionAsync: jest.fn(async (task: () => Promise<void>) => { await task(); }),
    runAsync: jest.fn(),
    getAllAsync: jest.fn(),
  };
}

describe('migrateDatabase', () => {
  it('applies both version-1 and version-2 schema to a fresh database', async () => {
    const db = createDb(0);

    await migrateDatabase(db as never);

    expect(db.execAsync).toHaveBeenCalledTimes(3);
    expect(db.execAsync.mock.calls[0][0]).toBe('PRAGMA journal_mode = WAL;');
    expect(db.execAsync.mock.calls[1][0]).toContain('CREATE TABLE IF NOT EXISTS check_ins');
    expect(db.execAsync.mock.calls[1][0]).toContain('PRAGMA user_version = 1');
    expect(db.execAsync.mock.calls[2][0]).toContain('CREATE TABLE IF NOT EXISTS daily_reflections');
    expect(db.execAsync.mock.calls[2][0]).toContain('CREATE TABLE IF NOT EXISTS daily_reflection_drafts');
    expect(db.execAsync.mock.calls[2][0]).toContain('PRAGMA user_version = 2');
    expect(db.withTransactionAsync).toHaveBeenCalledTimes(2);
  });

  it('applies only version-2 schema to a database already at version 1', async () => {
    const db = createDb(1);

    await migrateDatabase(db as never);

    expect(db.execAsync).toHaveBeenCalledTimes(1);
    expect(db.execAsync.mock.calls[0][0]).toContain('CREATE TABLE IF NOT EXISTS daily_reflections');
    expect(db.withTransactionAsync).toHaveBeenCalledTimes(1);
  });

  it('does nothing to a database already at version 2', async () => {
    const db = createDb(2);

    await migrateDatabase(db as never);

    expect(db.execAsync).not.toHaveBeenCalled();
    expect(db.withTransactionAsync).not.toHaveBeenCalled();
  });

  it('opens FootLog before applying its migrations', async () => {
    const db = createDb(2);
    jest.mocked(openDatabaseAsync).mockResolvedValue(db as never);

    await expect(openFootLogDatabase()).resolves.toBe(db);

    expect(openDatabaseAsync).toHaveBeenCalledWith('footlog.db');
    expect(db.getFirstAsync).toHaveBeenCalledWith('PRAGMA user_version');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest migrate.test.ts`
Expected: FAIL — the version-1-only implementation never creates `daily_reflections`/`daily_reflection_drafts`, so `execAsync` call counts and contents won't match.

- [ ] **Step 3: Extend the migration implementation**

```ts
// mobile/src/database/migrate.ts
import type { SQLiteDatabase } from 'expo-sqlite';

const VERSION_1_SCHEMA = `
CREATE TABLE IF NOT EXISTS check_ins (
  id TEXT PRIMARY KEY NOT NULL,
  checked_in_at TEXT NOT NULL,
  captured_at TEXT NOT NULL,
  latitude REAL NOT NULL,
  longitude REAL NOT NULL,
  accuracy_m REAL NOT NULL CHECK (accuracy_m >= 0),
  created_at TEXT NOT NULL,
  sync_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (sync_status IN ('pending'))
);
CREATE INDEX IF NOT EXISTS idx_check_ins_checked_in_at
  ON check_ins(checked_in_at);
CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
PRAGMA user_version = 1;
`;

const VERSION_2_SCHEMA = `
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
`;

export async function migrateDatabase(db: SQLiteDatabase): Promise<void> {
  const version = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const currentVersion = version?.user_version ?? 0;

  if (currentVersion < 1) {
    await db.execAsync('PRAGMA journal_mode = WAL;');

    await db.withTransactionAsync(async () => {
      await db.execAsync(VERSION_1_SCHEMA);
    });
  }

  if (currentVersion < 2) {
    await db.withTransactionAsync(async () => {
      await db.execAsync(VERSION_2_SCHEMA);
    });
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest migrate.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add mobile/src/database/migrate.ts mobile/__tests__/migrate.test.ts
git commit -m "feat(database): 회고·회고 초안 테이블 마이그레이션(v2) 추가"
```

---

## Task 4: 회고 리포지토리

**Files:**
- Create: `mobile/src/features/daily-reflection/domain.ts`
- Create: `mobile/src/features/daily-reflection/SQLiteDailyReflectionRepository.ts`
- Create: `mobile/src/features/daily-reflection/saveDailyReflection.ts`
- Test: `mobile/__tests__/SQLiteDailyReflectionRepository.test.ts`
- Test: `mobile/__tests__/saveDailyReflection.test.ts`

**Interfaces:**
- Produces: `type DailyReflection = { id, localDate, body, updatedAt }`, `interface DailyReflectionRepository { getByLocalDate, save, deleteByLocalDate }`, `interface DailyReflectionDraftRepository { getDraft, saveDraft, clearDraft }` (draft repository implemented in Task 5, interface declared here), `class SQLiteDailyReflectionRepository implements DailyReflectionRepository`, `saveDailyReflection(localDate: string, body: string, deps: { repository, uuid, now }): Promise<DailyReflection>`

- [ ] **Step 1: Write domain types**

```ts
// mobile/src/features/daily-reflection/domain.ts
export type DailyReflection = {
  id: string;
  localDate: string;
  body: string;
  updatedAt: string;
};

export interface DailyReflectionRepository {
  getByLocalDate(localDate: string): Promise<DailyReflection | null>;
  save(reflection: DailyReflection): Promise<void>;
  deleteByLocalDate(localDate: string): Promise<void>;
}

export interface DailyReflectionDraftRepository {
  getDraft(localDate: string): Promise<string | null>;
  saveDraft(localDate: string, body: string): Promise<void>;
  clearDraft(localDate: string): Promise<void>;
}
```

- [ ] **Step 2: Write the failing repository test**

```ts
// mobile/__tests__/SQLiteDailyReflectionRepository.test.ts
import { SQLiteDailyReflectionRepository } from '../src/features/daily-reflection/SQLiteDailyReflectionRepository';
import type { DailyReflection } from '../src/features/daily-reflection/domain';

type DailyReflectionRow = {
  id: string;
  local_date: string;
  body: string;
  updated_at: string;
};

function createFakeDb() {
  const rows: DailyReflectionRow[] = [];

  const db = {
    getFirstAsync: jest.fn(async (sql: string, localDate: string) => {
      if (sql.includes('SELECT * FROM daily_reflections')) {
        return rows.find((row) => row.local_date === localDate) ?? null;
      }
      return null;
    }),
    runAsync: jest.fn(async (sql: string, ...params: unknown[]) => {
      if (sql.includes('INSERT INTO daily_reflections')) {
        const [id, localDate, body, updatedAt] = params as [string, string, string, string];
        const existingIndex = rows.findIndex((row) => row.local_date === localDate);
        if (existingIndex >= 0) {
          rows[existingIndex] = { ...rows[existingIndex], body, updated_at: updatedAt };
        } else {
          rows.push({ id, local_date: localDate, body, updated_at: updatedAt });
        }
      } else if (sql.startsWith('DELETE FROM daily_reflections')) {
        const [localDate] = params as [string];
        const index = rows.findIndex((row) => row.local_date === localDate);
        if (index >= 0) rows.splice(index, 1);
      }
      return { changes: 1, lastInsertRowId: 0 };
    }),
    execAsync: jest.fn(),
    withTransactionAsync: jest.fn(),
    getAllAsync: jest.fn(),
  };

  return { db, rows };
}

describe('SQLiteDailyReflectionRepository', () => {
  it('returns null when no reflection exists for the date', async () => {
    const { db } = createFakeDb();
    const repository = new SQLiteDailyReflectionRepository(db as never);

    await expect(repository.getByLocalDate('2026-08-16')).resolves.toBeNull();
  });

  it('saves a new reflection and reads it back', async () => {
    const { db } = createFakeDb();
    const repository = new SQLiteDailyReflectionRepository(db as never);
    const reflection: DailyReflection = {
      id: 'reflection-1',
      localDate: '2026-08-16',
      body: '오늘은 회사와 집만 왔다갔다 했다.',
      updatedAt: '2026-08-16T12:00:00.000Z',
    };

    await repository.save(reflection);

    await expect(repository.getByLocalDate('2026-08-16')).resolves.toEqual(reflection);
  });

  it('upserts by local_date, keeping a single row on update', async () => {
    const { db, rows } = createFakeDb();
    const repository = new SQLiteDailyReflectionRepository(db as never);

    await repository.save({ id: 'reflection-1', localDate: '2026-08-16', body: '초안', updatedAt: '2026-08-16T09:00:00.000Z' });
    await repository.save({ id: 'reflection-1', localDate: '2026-08-16', body: '수정된 회고', updatedAt: '2026-08-16T20:00:00.000Z' });

    expect(rows).toHaveLength(1);
    await expect(repository.getByLocalDate('2026-08-16')).resolves.toEqual({
      id: 'reflection-1',
      localDate: '2026-08-16',
      body: '수정된 회고',
      updatedAt: '2026-08-16T20:00:00.000Z',
    });
  });

  it('deletes only the reflection for the requested date', async () => {
    const { db, rows } = createFakeDb();
    const repository = new SQLiteDailyReflectionRepository(db as never);
    await repository.save({ id: 'keep', localDate: '2026-08-15', body: 'a', updatedAt: '2026-08-15T00:00:00.000Z' });
    await repository.save({ id: 'remove', localDate: '2026-08-16', body: 'b', updatedAt: '2026-08-16T00:00:00.000Z' });

    await repository.deleteByLocalDate('2026-08-16');

    expect(rows.map((row) => row.local_date)).toEqual(['2026-08-15']);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx jest SQLiteDailyReflectionRepository.test.ts`
Expected: FAIL with "Cannot find module '../src/features/daily-reflection/SQLiteDailyReflectionRepository'"

- [ ] **Step 4: Write minimal implementation**

```ts
// mobile/src/features/daily-reflection/SQLiteDailyReflectionRepository.ts
import type { SQLiteDatabase } from 'expo-sqlite';

import type { DailyReflection, DailyReflectionRepository } from './domain';

type DailyReflectionRow = {
  id: string;
  local_date: string;
  body: string;
  updated_at: string;
};

const SELECT_BY_LOCAL_DATE = `
SELECT * FROM daily_reflections WHERE local_date = ?;
`;

const UPSERT_BY_LOCAL_DATE = `
INSERT INTO daily_reflections (id, local_date, body, updated_at)
VALUES (?, ?, ?, ?)
ON CONFLICT(local_date) DO UPDATE SET
  body = excluded.body,
  updated_at = excluded.updated_at;
`;

function toDailyReflection(row: DailyReflectionRow): DailyReflection {
  return {
    id: row.id,
    localDate: row.local_date,
    body: row.body,
    updatedAt: row.updated_at,
  };
}

export class SQLiteDailyReflectionRepository implements DailyReflectionRepository {
  constructor(private readonly db: SQLiteDatabase) {}

  async getByLocalDate(localDate: string): Promise<DailyReflection | null> {
    const row = await this.db.getFirstAsync<DailyReflectionRow>(SELECT_BY_LOCAL_DATE, localDate);
    return row ? toDailyReflection(row) : null;
  }

  async save(reflection: DailyReflection): Promise<void> {
    await this.db.runAsync(
      UPSERT_BY_LOCAL_DATE,
      reflection.id,
      reflection.localDate,
      reflection.body,
      reflection.updatedAt,
    );
  }

  async deleteByLocalDate(localDate: string): Promise<void> {
    await this.db.runAsync('DELETE FROM daily_reflections WHERE local_date = ?;', localDate);
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx jest SQLiteDailyReflectionRepository.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 6: Write the failing test for `saveDailyReflection`**

```ts
// mobile/__tests__/saveDailyReflection.test.ts
import { saveDailyReflection } from '../src/features/daily-reflection/saveDailyReflection';
import type { DailyReflection, DailyReflectionRepository } from '../src/features/daily-reflection/domain';

class FakeDailyReflectionRepository implements DailyReflectionRepository {
  saved: DailyReflection[] = [];
  private byDate = new Map<string, DailyReflection>();

  async getByLocalDate(localDate: string): Promise<DailyReflection | null> {
    return this.byDate.get(localDate) ?? null;
  }

  async save(reflection: DailyReflection): Promise<void> {
    this.saved.push(reflection);
    this.byDate.set(reflection.localDate, reflection);
  }

  async deleteByLocalDate(localDate: string): Promise<void> {
    this.byDate.delete(localDate);
  }
}

describe('saveDailyReflection', () => {
  it('generates a new id when no reflection exists for the date', async () => {
    const repository = new FakeDailyReflectionRepository();

    const result = await saveDailyReflection('2026-08-16', '오늘의 회고', {
      repository,
      uuid: () => 'new-id',
      now: () => '2026-08-16T12:00:00.000Z',
    });

    expect(result).toEqual({ id: 'new-id', localDate: '2026-08-16', body: '오늘의 회고', updatedAt: '2026-08-16T12:00:00.000Z' });
    expect(repository.saved).toEqual([result]);
  });

  it('reuses the existing id when a reflection already exists for the date', async () => {
    const repository = new FakeDailyReflectionRepository();
    await repository.save({ id: 'existing-id', localDate: '2026-08-16', body: '초안', updatedAt: '2026-08-16T09:00:00.000Z' });

    const result = await saveDailyReflection('2026-08-16', '수정된 회고', {
      repository,
      uuid: () => 'should-not-be-used',
      now: () => '2026-08-16T20:00:00.000Z',
    });

    expect(result.id).toBe('existing-id');
    expect(result.body).toBe('수정된 회고');
  });
});
```

- [ ] **Step 7: Run test to verify it fails**

Run: `npx jest saveDailyReflection.test.ts`
Expected: FAIL with "Cannot find module '../src/features/daily-reflection/saveDailyReflection'"

- [ ] **Step 8: Write minimal implementation**

```ts
// mobile/src/features/daily-reflection/saveDailyReflection.ts
import type { DailyReflection, DailyReflectionRepository } from './domain';

type Dependencies = {
  repository: DailyReflectionRepository;
  uuid: () => string;
  now: () => string;
};

export async function saveDailyReflection(
  localDate: string,
  body: string,
  deps: Dependencies,
): Promise<DailyReflection> {
  const existing = await deps.repository.getByLocalDate(localDate);
  const reflection: DailyReflection = {
    id: existing?.id ?? deps.uuid(),
    localDate,
    body,
    updatedAt: deps.now(),
  };
  await deps.repository.save(reflection);
  return reflection;
}
```

- [ ] **Step 9: Run test to verify it passes**

Run: `npx jest saveDailyReflection.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 10: Commit**

```bash
git add mobile/src/features/daily-reflection/domain.ts mobile/src/features/daily-reflection/SQLiteDailyReflectionRepository.ts mobile/src/features/daily-reflection/saveDailyReflection.ts mobile/__tests__/SQLiteDailyReflectionRepository.test.ts mobile/__tests__/saveDailyReflection.test.ts
git commit -m "feat(daily-reflection): 회고 리포지토리와 upsert 헬퍼 추가"
```

---

## Task 5: 회고 초안 리포지토리

**Files:**
- Create: `mobile/src/features/daily-reflection/SQLiteDailyReflectionDraftRepository.ts`
- Test: `mobile/__tests__/SQLiteDailyReflectionDraftRepository.test.ts`

**Interfaces:**
- Consumes: `DailyReflectionDraftRepository` (Task 4's `domain.ts`)
- Produces: `class SQLiteDailyReflectionDraftRepository implements DailyReflectionDraftRepository`

- [ ] **Step 1: Write the failing test**

```ts
// mobile/__tests__/SQLiteDailyReflectionDraftRepository.test.ts
import { SQLiteDailyReflectionDraftRepository } from '../src/features/daily-reflection/SQLiteDailyReflectionDraftRepository';

type DraftRow = { local_date: string; body: string; updated_at: string };

function createFakeDb() {
  const rows: DraftRow[] = [];

  const db = {
    getFirstAsync: jest.fn(async (sql: string, localDate: string) => {
      if (sql.includes('SELECT body FROM daily_reflection_drafts')) {
        return rows.find((row) => row.local_date === localDate) ?? null;
      }
      return null;
    }),
    runAsync: jest.fn(async (sql: string, ...params: unknown[]) => {
      if (sql.includes('INSERT INTO daily_reflection_drafts')) {
        const [localDate, body, updatedAt] = params as [string, string, string];
        const existingIndex = rows.findIndex((row) => row.local_date === localDate);
        if (existingIndex >= 0) {
          rows[existingIndex] = { local_date: localDate, body, updated_at: updatedAt };
        } else {
          rows.push({ local_date: localDate, body, updated_at: updatedAt });
        }
      } else if (sql.startsWith('DELETE FROM daily_reflection_drafts')) {
        const [localDate] = params as [string];
        const index = rows.findIndex((row) => row.local_date === localDate);
        if (index >= 0) rows.splice(index, 1);
      }
      return { changes: 1, lastInsertRowId: 0 };
    }),
    execAsync: jest.fn(),
    withTransactionAsync: jest.fn(),
    getAllAsync: jest.fn(),
  };

  return { db, rows };
}

describe('SQLiteDailyReflectionDraftRepository', () => {
  it('returns null when no draft exists', async () => {
    const { db } = createFakeDb();
    const repository = new SQLiteDailyReflectionDraftRepository(db as never, () => '2026-08-16T00:00:00.000Z');

    await expect(repository.getDraft('2026-08-16')).resolves.toBeNull();
  });

  it('saves and reads back a draft body', async () => {
    const { db } = createFakeDb();
    const repository = new SQLiteDailyReflectionDraftRepository(db as never, () => '2026-08-16T09:00:00.000Z');

    await repository.saveDraft('2026-08-16', '쓰는 중...');

    await expect(repository.getDraft('2026-08-16')).resolves.toBe('쓰는 중...');
  });

  it('overwrites the same date on repeated saves instead of creating rows', async () => {
    const { db, rows } = createFakeDb();
    const repository = new SQLiteDailyReflectionDraftRepository(db as never, () => '2026-08-16T09:00:00.000Z');

    await repository.saveDraft('2026-08-16', '초안 1');
    await repository.saveDraft('2026-08-16', '초안 2');

    expect(rows).toHaveLength(1);
    await expect(repository.getDraft('2026-08-16')).resolves.toBe('초안 2');
  });

  it('clears a draft', async () => {
    const { db, rows } = createFakeDb();
    const repository = new SQLiteDailyReflectionDraftRepository(db as never, () => '2026-08-16T09:00:00.000Z');
    await repository.saveDraft('2026-08-16', '초안');

    await repository.clearDraft('2026-08-16');

    expect(rows).toHaveLength(0);
    await expect(repository.getDraft('2026-08-16')).resolves.toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest SQLiteDailyReflectionDraftRepository.test.ts`
Expected: FAIL with "Cannot find module '../src/features/daily-reflection/SQLiteDailyReflectionDraftRepository'"

- [ ] **Step 3: Write minimal implementation**

```ts
// mobile/src/features/daily-reflection/SQLiteDailyReflectionDraftRepository.ts
import type { SQLiteDatabase } from 'expo-sqlite';

import type { DailyReflectionDraftRepository } from './domain';

const SELECT_DRAFT = `
SELECT body FROM daily_reflection_drafts WHERE local_date = ?;
`;

const UPSERT_DRAFT = `
INSERT INTO daily_reflection_drafts (local_date, body, updated_at)
VALUES (?, ?, ?)
ON CONFLICT(local_date) DO UPDATE SET
  body = excluded.body,
  updated_at = excluded.updated_at;
`;

export class SQLiteDailyReflectionDraftRepository implements DailyReflectionDraftRepository {
  constructor(
    private readonly db: SQLiteDatabase,
    private readonly now: () => string = () => new Date().toISOString(),
  ) {}

  async getDraft(localDate: string): Promise<string | null> {
    const row = await this.db.getFirstAsync<{ body: string }>(SELECT_DRAFT, localDate);
    return row ? row.body : null;
  }

  async saveDraft(localDate: string, body: string): Promise<void> {
    await this.db.runAsync(UPSERT_DRAFT, localDate, body, this.now());
  }

  async clearDraft(localDate: string): Promise<void> {
    await this.db.runAsync('DELETE FROM daily_reflection_drafts WHERE local_date = ?;', localDate);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest SQLiteDailyReflectionDraftRepository.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add mobile/src/features/daily-reflection/SQLiteDailyReflectionDraftRepository.ts mobile/__tests__/SQLiteDailyReflectionDraftRepository.test.ts
git commit -m "feat(daily-reflection): 회고 초안 리포지토리 추가"
```

---

## Task 6: CheckInRepository에 월별 날짜 조회 추가

**Files:**
- Modify: `mobile/src/features/check-in/domain.ts`
- Modify: `mobile/src/features/check-in/SQLiteCheckInRepository.ts`
- Modify: `mobile/__tests__/SQLiteCheckInRepository.test.ts`
- Modify: `mobile/__tests__/CheckInScreen.test.tsx`
- Modify: `mobile/__tests__/createCheckIn.test.ts`

**Interfaces:**
- Produces: `CheckInRepository.listLocalDatesWithCheckIns(year: number, month: number, timezone: string): Promise<string[]>` (`month`은 1~12, 1-indexed). 캘린더 탭(Task 9)이 이 메서드로 날짜별 점(dot) 표시 여부를 조회한다.

- [ ] **Step 1: Write the failing test for the new repository method**

`mobile/__tests__/SQLiteCheckInRepository.test.ts`에 다음 `it` 블록을 기존 `describe('SQLiteCheckInRepository', ...)` 안에 추가한다.

```ts
  it('lists distinct local dates with check-ins for the given month', async () => {
    const rows: CheckInRow[] = [
      rowFor({
        id: 'a', checkedInAt: '2026-07-31T15:00:00.000Z', capturedAt: '2026-07-31T15:00:00.000Z',
        latitude: 37.5, longitude: 127.0, accuracyM: 3, createdAt: '2026-07-31T15:00:00.000Z', syncStatus: 'pending',
      }), // 2026-08-01 00:00 in Asia/Seoul
      rowFor({
        id: 'b', checkedInAt: '2026-08-01T01:00:00.000Z', capturedAt: '2026-08-01T01:00:00.000Z',
        latitude: 37.5, longitude: 127.0, accuracyM: 3, createdAt: '2026-08-01T01:00:00.000Z', syncStatus: 'pending',
      }), // 2026-08-01 10:00 in Asia/Seoul, same local date as a
      rowFor({
        id: 'c', checkedInAt: '2026-08-14T23:30:00.000Z', capturedAt: '2026-08-14T23:30:00.000Z',
        latitude: 37.5, longitude: 127.0, accuracyM: 3, createdAt: '2026-08-14T23:30:00.000Z', syncStatus: 'pending',
      }), // 2026-08-15 08:30 in Asia/Seoul
    ];
    const db = {
      getFirstAsync: jest.fn(),
      execAsync: jest.fn(),
      withTransactionAsync: jest.fn(),
      runAsync: jest.fn(),
      getAllAsync: jest.fn(async (_sql: string, start: string, end: string) =>
        rows
          .filter((row) => row.checked_in_at >= start && row.checked_in_at < end)
          .sort((a, b) => a.checked_in_at.localeCompare(b.checked_in_at)),
      ),
    };
    const repository = new SQLiteCheckInRepository(db as never);

    await expect(repository.listLocalDatesWithCheckIns(2026, 8, 'Asia/Seoul')).resolves.toEqual([
      '2026-08-01',
      '2026-08-15',
    ]);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest SQLiteCheckInRepository.test.ts`
Expected: FAIL with "repository.listLocalDatesWithCheckIns is not a function"

- [ ] **Step 3: Add the method to the domain interface**

In `mobile/src/features/check-in/domain.ts`, extend `CheckInRepository`:

```ts
export interface CheckInRepository {
  save(checkIn: CheckIn): Promise<void>;
  listByLocalDay(localDate: string, timezone: string): Promise<CheckIn[]>;
  deleteById(id: string): Promise<void>;
  listLocalDatesWithCheckIns(year: number, month: number, timezone: string): Promise<string[]>;
}
```

- [ ] **Step 4: Implement it in `SQLiteCheckInRepository`**

Add near the top of `mobile/src/features/check-in/SQLiteCheckInRepository.ts` (alongside the existing `import { TZDate } ...`):

```ts
import { formatLocalDate } from '../../shared/localDate';
```

Add a new query constant and helper next to `SELECT_BY_LOCAL_DAY`/`localDayBounds`:

```ts
const SELECT_IN_MONTH = `
SELECT checked_in_at FROM check_ins
WHERE checked_in_at >= ? AND checked_in_at < ?
ORDER BY checked_in_at ASC;
`;

function localMonthBounds(year: number, month: number, timezone: string): [string, string] {
  const start = new TZDate(year, month - 1, 1, timezone);
  const end = month === 12
    ? new TZDate(year + 1, 0, 1, timezone)
    : new TZDate(year, month, 1, timezone);

  return [
    new Date(start.getTime()).toISOString(),
    new Date(end.getTime()).toISOString(),
  ];
}
```

Add the method to the `SQLiteCheckInRepository` class body:

```ts
  async listLocalDatesWithCheckIns(year: number, month: number, timezone: string): Promise<string[]> {
    const [start, end] = localMonthBounds(year, month, timezone);
    const rows = await this.db.getAllAsync<{ checked_in_at: string }>(SELECT_IN_MONTH, start, end);

    const localDates = new Set(rows.map((row) => formatLocalDate(new Date(row.checked_in_at), timezone)));
    return [...localDates].sort();
  }
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx jest SQLiteCheckInRepository.test.ts`
Expected: PASS (all tests including the new one)

- [ ] **Step 6: Update the two test-only fakes so the project still compiles**

`CheckInRepository` gained a required method, so both hand-written fakes must implement it. In `mobile/__tests__/CheckInScreen.test.tsx`, extend `FakeCheckInRepository`:

```ts
class FakeCheckInRepository implements CheckInRepository {
  saved: CheckIn[] = [];

  async save(checkIn: CheckIn): Promise<void> {
    this.saved.push(checkIn);
  }

  async listByLocalDay(): Promise<CheckIn[]> {
    return [];
  }

  async deleteById(): Promise<void> {}

  async listLocalDatesWithCheckIns(): Promise<string[]> {
    return [];
  }
}
```

In `mobile/__tests__/createCheckIn.test.ts`, apply the same addition to its `FakeCheckInRepository`:

```ts
class FakeCheckInRepository implements CheckInRepository {
  saved: CheckIn[] = [];

  async save(checkIn: CheckIn): Promise<void> {
    this.saved.push(checkIn);
  }

  async listByLocalDay(): Promise<CheckIn[]> {
    return [];
  }

  async deleteById(): Promise<void> {}

  async listLocalDatesWithCheckIns(): Promise<string[]> {
    return [];
  }
}
```

- [ ] **Step 7: Run the full suite and typecheck**

Run: `npx jest && npx tsc --noEmit`
Expected: PASS, no TypeScript errors

- [ ] **Step 8: Commit**

```bash
git add mobile/src/features/check-in/domain.ts mobile/src/features/check-in/SQLiteCheckInRepository.ts mobile/__tests__/SQLiteCheckInRepository.test.ts mobile/__tests__/CheckInScreen.test.tsx mobile/__tests__/createCheckIn.test.ts
git commit -m "feat(check-in): 월별 체크인 날짜 조회 메서드 추가"
```

---

## Task 7: 하루 요약 계산

**Files:**
- Create: `mobile/src/features/daily-reflection/dailySummary.ts`
- Test: `mobile/__tests__/dailySummary.test.ts`

**Interfaces:**
- Consumes: `haversineDistanceMeters`, `clusterByProximity` (Task 1), `type CheckIn` (`../check-in/domain`)
- Produces: `type DailySummary = { checkInCount, firstCheckedInAt, lastCheckedInAt, approximateDistanceMeters, longestConsecutiveArea }`, `computeDailySummary(checkIns: CheckIn[]): DailySummary`

- [ ] **Step 1: Write the failing test**

```ts
// mobile/__tests__/dailySummary.test.ts
import { computeDailySummary } from '../src/features/daily-reflection/dailySummary';
import type { CheckIn } from '../src/features/check-in/domain';

const METERS_PER_DEGREE_LATITUDE = 111194.9266;

function buildCheckIn(overrides: Partial<CheckIn> & Pick<CheckIn, 'id' | 'checkedInAt'>): CheckIn {
  return {
    latitude: 37.0,
    longitude: 127.0,
    accuracyM: 10,
    capturedAt: overrides.checkedInAt,
    createdAt: overrides.checkedInAt,
    syncStatus: 'pending',
    ...overrides,
  };
}

describe('computeDailySummary', () => {
  it('returns a zeroed-out summary for no check-ins', () => {
    expect(computeDailySummary([])).toEqual({
      checkInCount: 0,
      firstCheckedInAt: null,
      lastCheckedInAt: null,
      approximateDistanceMeters: 0,
      longestConsecutiveArea: null,
    });
  });

  it('treats a single check-in as its own zero-length area with zero distance', () => {
    const only = buildCheckIn({ id: 'only', checkedInAt: '2026-08-16T09:00:00.000Z' });

    expect(computeDailySummary([only])).toEqual({
      checkInCount: 1,
      firstCheckedInAt: '2026-08-16T09:00:00.000Z',
      lastCheckedInAt: '2026-08-16T09:00:00.000Z',
      approximateDistanceMeters: 0,
      longestConsecutiveArea: { startedAt: '2026-08-16T09:00:00.000Z', endedAt: '2026-08-16T09:00:00.000Z', checkInIds: ['only'] },
    });
  });

  it('picks the longest-duration cluster among several, and sums the point-to-point distance', () => {
    // Latitude-only offsets from 37.0 (longitude fixed at 127.0) give exact,
    // hand-verifiable distances: distance = degreesOfLatitude * METERS_PER_DEGREE_LATITUDE.
    const c1 = buildCheckIn({ id: 'c1', checkedInAt: '2026-08-16T07:00:00.000Z', latitude: 37.0 });
    const c2 = buildCheckIn({ id: 'c2', checkedInAt: '2026-08-16T09:00:00.000Z', latitude: 37.02 }); // ~2223.9m from c1
    const c3 = buildCheckIn({ id: 'c3', checkedInAt: '2026-08-16T10:00:00.000Z', latitude: 37.0205 }); // ~55.6m from c2
    const c4 = buildCheckIn({ id: 'c4', checkedInAt: '2026-08-16T11:00:00.000Z', latitude: 37.021 }); // ~55.6m from c3
    const c5 = buildCheckIn({ id: 'c5', checkedInAt: '2026-08-16T12:00:00.000Z', latitude: 37.0211 }); // ~11.1m from c4
    const c6 = buildCheckIn({ id: 'c6', checkedInAt: '2026-08-16T15:00:00.000Z', latitude: 37.0311 }); // ~1111.9m from c5
    const c7 = buildCheckIn({ id: 'c7', checkedInAt: '2026-08-16T18:00:00.000Z', latitude: 37.0391 }); // ~889.6m from c6

    const summary = computeDailySummary([c1, c2, c3, c4, c5, c6, c7]);

    expect(summary.checkInCount).toBe(7);
    expect(summary.firstCheckedInAt).toBe('2026-08-16T07:00:00.000Z');
    expect(summary.lastCheckedInAt).toBe('2026-08-16T18:00:00.000Z');
    expect(summary.longestConsecutiveArea).toEqual({
      startedAt: '2026-08-16T09:00:00.000Z',
      endedAt: '2026-08-16T12:00:00.000Z',
      checkInIds: ['c2', 'c3', 'c4', 'c5'],
    });
    expect(Math.abs(summary.approximateDistanceMeters - 4347.72)).toBeLessThan(10);
  });

  it('excludes check-ins with accuracy over 200m from clustering, but keeps them in the count', () => {
    const c1 = buildCheckIn({ id: 'c1', checkedInAt: '2026-08-16T07:00:00.000Z', latitude: 37.0, accuracyM: 10 });
    const c2 = buildCheckIn({ id: 'c2', checkedInAt: '2026-08-16T08:00:00.000Z', latitude: 37.0005, accuracyM: 250 }); // excluded: accuracy > 200
    const c3 = buildCheckIn({ id: 'c3', checkedInAt: '2026-08-16T09:00:00.000Z', latitude: 37.001, accuracyM: 10 }); // ~111.2m from c1 once c2 is skipped

    const summary = computeDailySummary([c1, c2, c3]);

    expect(summary.checkInCount).toBe(3);
    expect(summary.longestConsecutiveArea).toEqual({
      startedAt: '2026-08-16T07:00:00.000Z',
      endedAt: '2026-08-16T09:00:00.000Z',
      checkInIds: ['c1', 'c3'],
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest dailySummary.test.ts`
Expected: FAIL with "Cannot find module '../src/features/daily-reflection/dailySummary'"

- [ ] **Step 3: Write minimal implementation**

```ts
// mobile/src/features/daily-reflection/dailySummary.ts
import { clusterByProximity, haversineDistanceMeters } from '../../shared/geo';
import type { CheckIn } from '../check-in/domain';

const AREA_CLUSTER_THRESHOLD_METERS = 200;

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

function byCheckedInAtAscending(a: CheckIn, b: CheckIn): number {
  return Date.parse(a.checkedInAt) - Date.parse(b.checkedInAt);
}

function durationMs(area: { startedAt: string; endedAt: string }): number {
  return Date.parse(area.endedAt) - Date.parse(area.startedAt);
}

export function computeDailySummary(checkIns: CheckIn[]): DailySummary {
  if (checkIns.length === 0) {
    return {
      checkInCount: 0,
      firstCheckedInAt: null,
      lastCheckedInAt: null,
      approximateDistanceMeters: 0,
      longestConsecutiveArea: null,
    };
  }

  const sorted = [...checkIns].sort(byCheckedInAtAscending);

  let approximateDistanceMeters = 0;
  for (let i = 1; i < sorted.length; i += 1) {
    approximateDistanceMeters += haversineDistanceMeters(sorted[i - 1], sorted[i]);
  }

  const clusterableCheckIns = sorted.filter((checkIn) => checkIn.accuracyM <= AREA_CLUSTER_THRESHOLD_METERS);
  const clusters = clusterByProximity(clusterableCheckIns, AREA_CLUSTER_THRESHOLD_METERS);

  const longestConsecutiveArea = clusters.reduce<DailySummary['longestConsecutiveArea']>((longest, cluster) => {
    const candidate = {
      startedAt: cluster[0].checkedInAt,
      endedAt: cluster[cluster.length - 1].checkedInAt,
      checkInIds: cluster.map((checkIn) => checkIn.id),
    };

    return !longest || durationMs(candidate) > durationMs(longest) ? candidate : longest;
  }, null);

  return {
    checkInCount: sorted.length,
    firstCheckedInAt: sorted[0].checkedInAt,
    lastCheckedInAt: sorted[sorted.length - 1].checkedInAt,
    approximateDistanceMeters,
    longestConsecutiveArea,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest dailySummary.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add mobile/src/features/daily-reflection/dailySummary.ts mobile/__tests__/dailySummary.test.ts
git commit -m "feat(daily-reflection): 하루 요약(개수·거리·최장 연속 영역) 계산 추가"
```

---

## Task 8: DailyReflectionContext와 RootLayout 배선

**Files:**
- Create: `mobile/src/features/daily-reflection/DailyReflectionContext.tsx`
- Modify: `mobile/app/_layout.tsx`
- Modify: `mobile/__tests__/RootLayout.test.tsx`

**Interfaces:**
- Consumes: `SQLiteDailyReflectionRepository`, `SQLiteDailyReflectionDraftRepository` (Tasks 4-5)
- Produces: `type DailyReflectionDependencies = { reflectionRepository, draftRepository, uuid, now }`, `DailyReflectionProvider`, `useDailyReflectionDependencies(): DailyReflectionDependencies`. RootLayout이 `day/[date]` 라우트를 등록한다.

- [ ] **Step 1: Create the context (mirrors `NotificationSettingsContext.tsx`)**

```tsx
// mobile/src/features/daily-reflection/DailyReflectionContext.tsx
import { createContext, useContext, type PropsWithChildren } from 'react';

import type { DailyReflectionDraftRepository, DailyReflectionRepository } from './domain';

export type DailyReflectionDependencies = {
  reflectionRepository: DailyReflectionRepository;
  draftRepository: DailyReflectionDraftRepository;
  uuid: () => string;
  now: () => string;
};

const DailyReflectionContext = createContext<DailyReflectionDependencies | null>(null);

export function DailyReflectionProvider({
  value,
  children,
}: PropsWithChildren<{ value: DailyReflectionDependencies }>) {
  return (
    <DailyReflectionContext.Provider value={value}>
      {children}
    </DailyReflectionContext.Provider>
  );
}

export function useDailyReflectionDependencies(): DailyReflectionDependencies {
  const dependencies = useContext(DailyReflectionContext);
  if (!dependencies) {
    throw new Error('Daily reflection dependencies are unavailable before database initialization.');
  }
  return dependencies;
}
```

- [ ] **Step 2: Check existing `RootLayout.test.tsx` to understand what must keep passing**

Run: `npx jest RootLayout.test.tsx` (before any change, to see current baseline PASS)

- [ ] **Step 3: Wire the provider and new routes into `app/_layout.tsx`**

Add imports at the top of `mobile/app/_layout.tsx`:

```ts
import * as Crypto from 'expo-crypto';
```

```ts
import { SQLiteDailyReflectionRepository } from '../src/features/daily-reflection/SQLiteDailyReflectionRepository';
import { SQLiteDailyReflectionDraftRepository } from '../src/features/daily-reflection/SQLiteDailyReflectionDraftRepository';
import {
  DailyReflectionProvider,
  type DailyReflectionDependencies,
} from '../src/features/daily-reflection/DailyReflectionContext';
```

Extend the `InitializationState` `'ready'` variant:

```ts
type InitializationState =
  | { status: 'loading' }
  | {
      status: 'ready';
      repository: CheckInRepository;
      notificationSettings: NotificationSettingsDependencies;
      dailyReflection: DailyReflectionDependencies;
    }
  | { status: 'error' };
```

Update the database-open effect to construct the new repositories and pass them into state:

```ts
    void openFootLogDatabase()
      .then((database) => {
        if (isCurrent) {
          const settingsRepository = new AppSettingsRepository(database);
          setState({
            status: 'ready',
            repository: new SQLiteCheckInRepository(database),
            notificationSettings: {
              repository: settingsRepository,
              scheduler: new ExpoNotificationScheduler(settingsRepository),
            },
            dailyReflection: {
              reflectionRepository: new SQLiteDailyReflectionRepository(database),
              draftRepository: new SQLiteDailyReflectionDraftRepository(database),
              uuid: Crypto.randomUUID,
              now: () => new Date().toISOString(),
            },
          });
        }
      })
      .catch(() => {
        if (isCurrent) setState({ status: 'error' });
      });
```

Wrap the `<Stack>` with `DailyReflectionProvider` and register the new route:

```tsx
  return (
    <FootLogRepositoryProvider value={state.repository}>
      <NotificationSettingsProvider value={state.notificationSettings}>
        <DailyReflectionProvider value={state.dailyReflection}>
          <Stack>
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="check-in" options={{ title: '체크인' }} />
            <Stack.Screen name="day/[date]" options={{ title: '일일 회고' }} />
            <Stack.Screen name="settings/reminders" options={{ title: '체크인 알림' }} />
          </Stack>
        </DailyReflectionProvider>
      </NotificationSettingsProvider>
    </FootLogRepositoryProvider>
  );
```

- [ ] **Step 4: Confirm `RootLayout.test.tsx` still passes unmodified**

`mobile/__tests__/RootLayout.test.tsx` mocks `expo-router`'s `Stack.Screen` to always render `null` (`MockStack.Screen = () => null`), so no descendant screen — including anything a provider supplies via context — actually renders in this test. It also doesn't assert on the `FootLogRepositoryProvider`/`NotificationSettingsProvider` `value` props (both are mocked as bare pass-through components that render `children` and ignore `value`). `SQLiteDailyReflectionRepository` and `SQLiteDailyReflectionDraftRepository` are plain classes whose constructors only store the `db` reference — constructing them against the test's mock database object (`{}`) cannot throw. `DailyReflectionProvider` is not mocked by this test, but a real `Context.Provider` wrapping `children` is equally harmless here. So no changes to `RootLayout.test.tsx` are required by this task.

Run: `npx jest RootLayout.test.tsx` and confirm it still PASSes after Step 3's edit. If it unexpectedly fails, the likely cause is `expo-crypto` not being mocked by the `jest-expo` preset in this project's version — in that case, add a `jest.mock('expo-crypto', () => ({ randomUUID: () => 'mock-uuid' }));` call near the top of `RootLayout.test.tsx`, alongside its other `jest.mock(...)` calls.

- [ ] **Step 5: Run the full suite and typecheck**

Run: `npx jest && npx tsc --noEmit`
Expected: PASS. If `tsc` complains that `'/day/[date]'` or `Stack.Screen name="day/[date]"` isn't a recognized route, run `npx expo start` once (or `npx expo customize tsconfig.json` is not needed — just starting the dev server regenerates `.expo/types/router.d.ts`) after Task 11 creates `app/day/[date].tsx`; typed-route generation depends on the route file existing, so full type-checking of the route name may only pass once Task 11's file is in place. Note this and continue — it does not block this task's repository/context wiring.

- [ ] **Step 6: Commit**

```bash
git add mobile/src/features/daily-reflection/DailyReflectionContext.tsx mobile/app/_layout.tsx mobile/__tests__/RootLayout.test.tsx
git commit -m "feat(daily-reflection): DailyReflectionContext 배선과 회고 라우트 등록"
```

---

## Task 9: 캘린더 탭 월간 그리드

**Files:**
- Modify: `mobile/app/(tabs)/calendar.tsx`
- Test: `mobile/__tests__/CalendarScreen.test.tsx`

**Interfaces:**
- Consumes: `useFootLogRepository()` → `listLocalDatesWithCheckIns` (Task 6), `localDateAndTimezone` (Task 2)
- Produces: 날짜 셀 탭 시 `router.push({ pathname: '/day/[date]', params: { date } })` 호출

- [ ] **Step 1: Write the failing test**

```tsx
// mobile/__tests__/CalendarScreen.test.tsx
const mockPush = jest.fn();
let mockRepository: { listLocalDatesWithCheckIns: jest.Mock };

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
}));

jest.mock('../src/database/FootLogContext', () => ({
  useFootLogRepository: () => mockRepository,
}));

import { fireEvent, render, waitFor } from '@testing-library/react-native';

import CalendarRoute from '../app/(tabs)/calendar';

describe('CalendarRoute', () => {
  beforeEach(() => {
    mockPush.mockClear();
  });

  it('shows a dot only for dates with check-ins', async () => {
    mockRepository = { listLocalDatesWithCheckIns: jest.fn().mockResolvedValue(['2026-08-05', '2026-08-12']) };

    const view = render(<CalendarRoute />);

    await waitFor(() => expect(view.queryByTestId('calendar-dot-2026-08-05')).toBeTruthy());
    expect(view.queryByTestId('calendar-dot-2026-08-12')).toBeTruthy();
    expect(view.queryByTestId('calendar-dot-2026-08-06')).toBeNull();
  });

  it('navigates to the day route for the 1st of the displayed month', async () => {
    mockRepository = { listLocalDatesWithCheckIns: jest.fn().mockResolvedValue([]) };

    const view = render(<CalendarRoute />);
    await waitFor(() => expect(mockRepository.listLocalDatesWithCheckIns).toHaveBeenCalled());

    await fireEvent.press(view.getByRole('button', { name: / 1일$/ }));

    expect(mockPush).toHaveBeenCalledWith(
      expect.objectContaining({
        pathname: '/day/[date]',
        params: expect.objectContaining({ date: expect.stringMatching(/-01$/) }),
      }),
    );
  });

  it('still renders the grid when the dot lookup fails', async () => {
    mockRepository = { listLocalDatesWithCheckIns: jest.fn().mockRejectedValue(new Error('db unavailable')) };

    const view = render(<CalendarRoute />);

    await waitFor(() => expect(mockRepository.listLocalDatesWithCheckIns).toHaveBeenCalled());
    expect(view.getByText(/\d+년 \d+월/)).toBeTruthy();
  });

  it('reloads dots when navigating to the previous month', async () => {
    mockRepository = { listLocalDatesWithCheckIns: jest.fn().mockResolvedValue([]) };
    const view = render(<CalendarRoute />);
    await waitFor(() => expect(mockRepository.listLocalDatesWithCheckIns).toHaveBeenCalledTimes(1));

    await fireEvent.press(view.getByRole('button', { name: '이전 달' }));

    await waitFor(() => expect(mockRepository.listLocalDatesWithCheckIns).toHaveBeenCalledTimes(2));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest CalendarScreen.test.tsx`
Expected: FAIL — current `calendar.tsx` is a static stub with no repository call, no buttons, no dots.

- [ ] **Step 3: Write minimal implementation**

```tsx
// mobile/app/(tabs)/calendar.tsx
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useFootLogRepository } from '../../src/database/FootLogContext';
import { localDateAndTimezone } from '../../src/shared/localDate';

const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

function firstWeekday(year: number, month: number): number {
  return new Date(year, month - 1, 1).getDay();
}

function toLocalDateString(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export default function CalendarRoute() {
  const router = useRouter();
  const repository = useFootLogRepository();
  const { localDate: todayLocalDate, timezone } = localDateAndTimezone();
  const [todayYear, todayMonth] = todayLocalDate.split('-').map(Number);
  const [year, setYear] = useState(todayYear);
  const [month, setMonth] = useState(todayMonth);
  const [datesWithCheckIns, setDatesWithCheckIns] = useState<Set<string>>(new Set());

  const loadDots = useCallback(() => {
    void repository.listLocalDatesWithCheckIns(year, month, timezone)
      .then((dates) => setDatesWithCheckIns(new Set(dates)))
      .catch(() => setDatesWithCheckIns(new Set()));
  }, [repository, year, month, timezone]);

  useEffect(() => { loadDots(); }, [loadDots]);

  const goToPreviousMonth = () => {
    if (month === 1) { setYear((value) => value - 1); setMonth(12); } else { setMonth((value) => value - 1); }
  };

  const goToNextMonth = () => {
    if (month === 12) { setYear((value) => value + 1); setMonth(1); } else { setMonth((value) => value + 1); }
  };

  const totalDays = daysInMonth(year, month);
  const leadingBlanks = firstWeekday(year, month);
  const cells: (number | null)[] = [
    ...Array.from({ length: leadingBlanks }, () => null),
    ...Array.from({ length: totalDays }, (_, index) => index + 1),
  ];

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="이전 달" onPress={goToPreviousMonth}>
          <Text style={styles.navText}>‹</Text>
        </Pressable>
        <Text style={styles.title}>{year}년 {month}월</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="다음 달" onPress={goToNextMonth}>
          <Text style={styles.navText}>›</Text>
        </Pressable>
      </View>

      <View style={styles.weekdayRow}>
        {WEEKDAY_LABELS.map((label) => (
          <Text key={label} style={styles.weekdayLabel}>{label}</Text>
        ))}
      </View>

      <View style={styles.grid}>
        {cells.map((day, index) => {
          if (day === null) {
            return <View key={`blank-${index}`} style={styles.cell} />;
          }
          const localDate = toLocalDateString(year, month, day);
          const hasCheckIns = datesWithCheckIns.has(localDate);
          return (
            <Pressable
              key={localDate}
              accessibilityRole="button"
              accessibilityLabel={`${year}년 ${month}월 ${day}일`}
              onPress={() => router.push({ pathname: '/day/[date]', params: { date: localDate } })}
              style={styles.cell}
            >
              <Text style={styles.dayText}>{day}</Text>
              {hasCheckIns && <View testID={`calendar-dot-${localDate}`} style={styles.dot} />}
            </Pressable>
          );
        })}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#ffffff', padding: 16, gap: 16 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  navText: { fontSize: 24, color: '#2e6af0', paddingHorizontal: 12 },
  title: { fontSize: 20, fontWeight: '700', color: '#1b1b1b' },
  weekdayRow: { flexDirection: 'row' },
  weekdayLabel: { flex: 1, textAlign: 'center', fontSize: 13, color: '#8a8a8a' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: `${100 / 7}%`, aspectRatio: 1, alignItems: 'center', justifyContent: 'center', gap: 4 },
  dayText: { fontSize: 15, color: '#1b1b1b' },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#2e6af0' },
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest CalendarScreen.test.tsx`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add mobile/app/\(tabs\)/calendar.tsx mobile/__tests__/CalendarScreen.test.tsx
git commit -m "feat(calendar): 월간 날짜 그리드와 체크인 점 표시 구현"
```

---

## Task 10: 회고 상세 화면 데이터 로딩 훅

**Files:**
- Create: `mobile/src/features/daily-reflection/useDailyDetail.ts`
- Test: `mobile/__tests__/useDailyDetail.test.ts`

**Interfaces:**
- Consumes: `useFootLogRepository()`, `useDailyReflectionDependencies()` (Task 8), `useNotificationSettingsDependencies()` (existing), `localDateAndTimezone` (Task 2)
- Produces: `type DailyDetailState = { status: 'loading' } | { status: 'error' } | { status: 'loaded'; checkIns; reflection; draft; activityWindow }`, `useDailyDetail(localDate: string): { state: DailyDetailState; reload: () => void }`

- [ ] **Step 1: Write the failing test**

```ts
// mobile/__tests__/useDailyDetail.test.ts
const mockCheckInRepository = { listByLocalDay: jest.fn() };
const mockReflectionRepository = { getByLocalDate: jest.fn() };
const mockDraftRepository = { getDraft: jest.fn() };
const mockNotificationSettingsRepository = { getNotificationSettings: jest.fn() };

jest.mock('../src/database/FootLogContext', () => ({
  useFootLogRepository: () => mockCheckInRepository,
}));
jest.mock('../src/features/daily-reflection/DailyReflectionContext', () => ({
  useDailyReflectionDependencies: () => ({
    reflectionRepository: mockReflectionRepository,
    draftRepository: mockDraftRepository,
  }),
}));
jest.mock('../src/features/notifications/NotificationSettingsContext', () => ({
  useNotificationSettingsDependencies: () => ({ repository: mockNotificationSettingsRepository }),
}));

import { act, renderHook, waitFor } from '@testing-library/react-native';

import { useDailyDetail } from '../src/features/daily-reflection/useDailyDetail';
import type { CheckIn } from '../src/features/check-in/domain';

const checkIn: CheckIn = {
  id: 'c1',
  latitude: 37.5,
  longitude: 127.0,
  accuracyM: 10,
  capturedAt: '2026-08-16T09:00:00.000Z',
  checkedInAt: '2026-08-16T09:00:00.000Z',
  createdAt: '2026-08-16T09:00:00.000Z',
  syncStatus: 'pending',
};

describe('useDailyDetail', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('loads check-ins, reflection, draft, and activity window in parallel', async () => {
    mockCheckInRepository.listByLocalDay.mockResolvedValue([checkIn]);
    mockReflectionRepository.getByLocalDate.mockResolvedValue(null);
    mockDraftRepository.getDraft.mockResolvedValue('초안');
    mockNotificationSettingsRepository.getNotificationSettings.mockResolvedValue({
      enabled: true, startHour: 7, endHour: 23, scheduledIds: [],
    });

    const { result } = renderHook(() => useDailyDetail('2026-08-16'));

    expect(result.current.state).toEqual({ status: 'loading' });

    await waitFor(() => expect(result.current.state.status).toBe('loaded'));

    expect(result.current.state).toEqual({
      status: 'loaded',
      checkIns: [checkIn],
      reflection: null,
      draft: '초안',
      activityWindow: { startHour: 7, endHour: 23 },
    });
  });

  it('reports an error state when any of the loads fail', async () => {
    mockCheckInRepository.listByLocalDay.mockRejectedValue(new Error('db unavailable'));
    mockReflectionRepository.getByLocalDate.mockResolvedValue(null);
    mockDraftRepository.getDraft.mockResolvedValue(null);
    mockNotificationSettingsRepository.getNotificationSettings.mockResolvedValue({
      enabled: false, startHour: 7, endHour: 23, scheduledIds: [],
    });

    const { result } = renderHook(() => useDailyDetail('2026-08-16'));

    await waitFor(() => expect(result.current.state).toEqual({ status: 'error' }));
  });

  it('reloads when reload() is called', async () => {
    mockCheckInRepository.listByLocalDay.mockResolvedValue([]);
    mockReflectionRepository.getByLocalDate.mockResolvedValue(null);
    mockDraftRepository.getDraft.mockResolvedValue(null);
    mockNotificationSettingsRepository.getNotificationSettings.mockResolvedValue({
      enabled: false, startHour: 7, endHour: 23, scheduledIds: [],
    });

    const { result } = renderHook(() => useDailyDetail('2026-08-16'));
    await waitFor(() => expect(result.current.state.status).toBe('loaded'));

    act(() => { result.current.reload(); });

    await waitFor(() => expect(mockCheckInRepository.listByLocalDay).toHaveBeenCalledTimes(2));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest useDailyDetail.test.ts`
Expected: FAIL with "Cannot find module '../src/features/daily-reflection/useDailyDetail'"

- [ ] **Step 3: Write minimal implementation**

```ts
// mobile/src/features/daily-reflection/useDailyDetail.ts
import { useCallback, useEffect, useState } from 'react';

import { useFootLogRepository } from '../../database/FootLogContext';
import { useNotificationSettingsDependencies } from '../notifications/NotificationSettingsContext';
import { localDateAndTimezone } from '../../shared/localDate';
import type { CheckIn } from '../check-in/domain';
import { useDailyReflectionDependencies } from './DailyReflectionContext';
import type { DailyReflection } from './domain';

export type DailyDetailState =
  | { status: 'loading' }
  | { status: 'error' }
  | {
      status: 'loaded';
      checkIns: CheckIn[];
      reflection: DailyReflection | null;
      draft: string | null;
      activityWindow: { startHour: number; endHour: number };
    };

export type UseDailyDetailResult = {
  state: DailyDetailState;
  reload: () => void;
};

export function useDailyDetail(localDate: string): UseDailyDetailResult {
  const checkInRepository = useFootLogRepository();
  const { reflectionRepository, draftRepository } = useDailyReflectionDependencies();
  const { repository: notificationSettingsRepository } = useNotificationSettingsDependencies();
  const [state, setState] = useState<DailyDetailState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  const load = useCallback(() => {
    let isCurrent = true;
    setState({ status: 'loading' });
    const { timezone } = localDateAndTimezone();

    void Promise.all([
      checkInRepository.listByLocalDay(localDate, timezone),
      reflectionRepository.getByLocalDate(localDate),
      draftRepository.getDraft(localDate),
      notificationSettingsRepository.getNotificationSettings(),
    ])
      .then(([checkIns, reflection, draft, notificationSettings]) => {
        if (!isCurrent) return;
        setState({
          status: 'loaded',
          checkIns,
          reflection,
          draft,
          activityWindow: { startHour: notificationSettings.startHour, endHour: notificationSettings.endHour },
        });
      })
      .catch(() => {
        if (isCurrent) setState({ status: 'error' });
      });

    return () => { isCurrent = false; };
  }, [checkInRepository, reflectionRepository, draftRepository, notificationSettingsRepository, localDate]);

  useEffect(() => load(), [load, attempt]);

  return { state, reload: () => setAttempt((value) => value + 1) };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest useDailyDetail.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add mobile/src/features/daily-reflection/useDailyDetail.ts mobile/__tests__/useDailyDetail.test.ts
git commit -m "feat(daily-reflection): 회고 상세 화면 데이터 로딩 훅 추가"
```

---

## Task 11: 회고 상세 화면 — 지도·타임라인·하루 요약 렌더링

**Files:**
- Create: `mobile/app/day/[date].tsx`
- Create: `mobile/src/features/daily-reflection/DailyDetailScreen.tsx`
- Test: `mobile/__tests__/DailyDetailScreen.test.tsx`

**Interfaces:**
- Consumes: `useDailyDetail` (Task 10), `computeDailySummary` (Task 7)
- Produces: `DailyDetailScreen({ localDate }: { localDate: string })` — Task 12가 같은 파일에 회고 본문 편집기를 추가한다.

- [ ] **Step 1: Write the failing test**

```tsx
// mobile/__tests__/DailyDetailScreen.test.tsx
jest.mock('react-native-maps', () => {
  const React = require('react');
  const { Pressable, View } = require('react-native');

  return {
    __esModule: true,
    default: ({ children, ...props }: { children?: React.ReactNode }) => (
      <View testID="daily-detail-map" {...props}>{children}</View>
    ),
    Marker: ({ onPress, testID, ...props }: { onPress?: () => void; testID?: string }) => (
      <Pressable testID={testID} onPress={onPress} {...props} />
    ),
    Polyline: (props: object) => <View testID="daily-detail-polyline" {...props} />,
  };
});

const mockUseDailyDetail = jest.fn();
jest.mock('../src/features/daily-reflection/useDailyDetail', () => ({
  useDailyDetail: () => mockUseDailyDetail(),
}));
jest.mock('../src/features/daily-reflection/DailyReflectionContext', () => ({
  useDailyReflectionDependencies: () => ({
    reflectionRepository: { getByLocalDate: jest.fn(), save: jest.fn(), deleteByLocalDate: jest.fn() },
    draftRepository: { getDraft: jest.fn(), saveDraft: jest.fn(), clearDraft: jest.fn() },
    uuid: () => 'uuid',
    now: () => '2026-08-16T00:00:00.000Z',
  }),
}));

import { fireEvent, render, waitFor } from '@testing-library/react-native';

import { DailyDetailScreen } from '../src/features/daily-reflection/DailyDetailScreen';
import type { CheckIn } from '../src/features/check-in/domain';

function buildCheckIn(overrides: Partial<CheckIn> & Pick<CheckIn, 'id' | 'checkedInAt'>): CheckIn {
  return {
    latitude: 37.5,
    longitude: 127.0,
    accuracyM: 10,
    capturedAt: overrides.checkedInAt,
    createdAt: overrides.checkedInAt,
    syncStatus: 'pending',
    ...overrides,
  };
}

describe('DailyDetailScreen', () => {
  it('shows a loading message while loading', () => {
    mockUseDailyDetail.mockReturnValue({ state: { status: 'loading' }, reload: jest.fn() });
    const view = render(<DailyDetailScreen localDate="2026-08-16" />);
    expect(view.getByText('이날의 기록을 불러오는 중이에요.')).toBeTruthy();
  });

  it('shows an error message with a working retry on failure', () => {
    const reload = jest.fn();
    mockUseDailyDetail.mockReturnValue({ state: { status: 'error' }, reload });
    const view = render(<DailyDetailScreen localDate="2026-08-16" />);

    expect(view.getByText('이날의 기록을 불러오지 못했어요.')).toBeTruthy();
    fireEvent.press(view.getByRole('button', { name: '다시 시도' }));
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('shows the empty state when there are no check-ins', () => {
    mockUseDailyDetail.mockReturnValue({
      state: { status: 'loaded', checkIns: [], reflection: null, draft: null, activityWindow: { startHour: 7, endHour: 23 } },
      reload: jest.fn(),
    });
    const view = render(<DailyDetailScreen localDate="2026-08-16" />);
    expect(view.getByText('이날은 남겨진 발자국이 없어요.')).toBeTruthy();
  });

  it('shows daily summary facts for a day with check-ins', () => {
    const checkIn1 = buildCheckIn({ id: 'c1', checkedInAt: '2026-08-16T09:00:00.000Z' });
    const checkIn2 = buildCheckIn({ id: 'c2', checkedInAt: '2026-08-16T12:00:00.000Z' });
    mockUseDailyDetail.mockReturnValue({
      state: { status: 'loaded', checkIns: [checkIn1, checkIn2], reflection: null, draft: null, activityWindow: { startHour: 7, endHour: 23 } },
      reload: jest.fn(),
    });
    const view = render(<DailyDetailScreen localDate="2026-08-16" />);

    expect(view.getByText(/첫 체크인 09:00 · 마지막 체크인 12:00/)).toBeTruthy();
  });

  it('syncs selection between a map pin and its timeline slot', async () => {
    const checkIn = buildCheckIn({ id: 'c1', checkedInAt: '2026-08-16T09:00:00.000Z' });
    mockUseDailyDetail.mockReturnValue({
      state: { status: 'loaded', checkIns: [checkIn], reflection: null, draft: null, activityWindow: { startHour: 7, endHour: 23 } },
      reload: jest.fn(),
    });
    const view = render(<DailyDetailScreen localDate="2026-08-16" />);

    await fireEvent.press(view.getByTestId('daily-detail-pin-c1'));

    await waitFor(() => {
      const timelineSlot = view.getByTestId('daily-detail-timeline-c1');
      const flattenedStyle = [timelineSlot.props.style].flat();
      expect(flattenedStyle).toEqual(expect.arrayContaining([expect.objectContaining({ borderColor: '#2e6af0' })]));
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest DailyDetailScreen.test.ts`
Expected: FAIL with "Cannot find module '../src/features/daily-reflection/DailyDetailScreen'"

- [ ] **Step 3: Write minimal implementation**

```tsx
// mobile/src/features/daily-reflection/DailyDetailScreen.tsx
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MapView, { Marker, Polyline } from 'react-native-maps';

import type { CheckIn } from '../check-in/domain';
import { computeDailySummary } from './dailySummary';
import { useDailyDetail } from './useDailyDetail';

type DailyDetailScreenProps = {
  localDate: string;
};

function formatLocalTime(checkedInAt: string): string {
  return new Intl.DateTimeFormat('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(checkedInAt));
}

function formatDuration(startedAt: string, endedAt: string): string {
  const totalMinutes = Math.round((Date.parse(endedAt) - Date.parse(startedAt)) / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes}분`;
  return minutes === 0 ? `${hours}시간` : `${hours}시간 ${minutes}분`;
}

function buildTimelineHours(
  startHour: number,
  endHour: number,
  checkIns: CheckIn[],
): { hour: number; checkIn: CheckIn | null }[] {
  const checkInByHour = new Map<number, CheckIn>();
  for (const checkIn of checkIns) {
    const hour = new Date(checkIn.checkedInAt).getHours();
    if (!checkInByHour.has(hour)) checkInByHour.set(hour, checkIn);
  }

  return Array.from({ length: endHour - startHour + 1 }, (_, index) => {
    const hour = startHour + index;
    return { hour, checkIn: checkInByHour.get(hour) ?? null };
  });
}

export function DailyDetailScreen({ localDate }: DailyDetailScreenProps) {
  const { state, reload } = useDailyDetail(localDate);
  const [selectedCheckInId, setSelectedCheckInId] = useState<string | null>(null);

  if (state.status === 'loading') {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centered}><Text style={styles.message}>이날의 기록을 불러오는 중이에요.</Text></View>
      </SafeAreaView>
    );
  }

  if (state.status === 'error') {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centered}>
          <Text style={styles.message}>이날의 기록을 불러오지 못했어요.</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="다시 시도" onPress={reload} style={styles.retryButton}>
            <Text style={styles.retryButtonText}>다시 시도</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const { checkIns, activityWindow } = state;
  const summary = computeDailySummary(checkIns);
  const sortedCheckIns = [...checkIns].sort((a, b) => Date.parse(a.checkedInAt) - Date.parse(b.checkedInAt));
  const timelineHours = buildTimelineHours(activityWindow.startHour, activityWindow.endHour, checkIns);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{localDate}</Text>
        <Text style={styles.subtitle}>체크인 {summary.checkInCount}개</Text>
      </View>

      {checkIns.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>이날은 남겨진 발자국이 없어요.</Text>
        </View>
      ) : (
        <>
          <MapView
            style={styles.map}
            initialRegion={{
              latitude: sortedCheckIns[0].latitude,
              longitude: sortedCheckIns[0].longitude,
              latitudeDelta: 0.02,
              longitudeDelta: 0.02,
            }}
          >
            {sortedCheckIns.map((checkIn) => (
              <Marker
                key={checkIn.id}
                testID={`daily-detail-pin-${checkIn.id}`}
                coordinate={{ latitude: checkIn.latitude, longitude: checkIn.longitude }}
                pinColor={checkIn.id === selectedCheckInId ? '#2e6af0' : undefined}
                onPress={() => setSelectedCheckInId(checkIn.id)}
              />
            ))}
            <Polyline coordinates={sortedCheckIns.map((checkIn) => ({ latitude: checkIn.latitude, longitude: checkIn.longitude }))} />
          </MapView>
          <Text style={styles.mapCaption}>선은 실제 이동 경로가 아니라 기록 지점을 시간순으로 연결한 선이에요.</Text>

          <View style={styles.summary}>
            <Text style={styles.summaryText}>
              첫 체크인 {formatLocalTime(summary.firstCheckedInAt!)} · 마지막 체크인 {formatLocalTime(summary.lastCheckedInAt!)}
            </Text>
            <Text style={styles.summaryText}>이동 거리 약 {Math.round(summary.approximateDistanceMeters)}m</Text>
            {summary.longestConsecutiveArea && (
              <Text style={styles.summaryText}>
                가장 오래 머문 영역 {formatDuration(summary.longestConsecutiveArea.startedAt, summary.longestConsecutiveArea.endedAt)}
              </Text>
            )}
          </View>

          <View style={styles.timeline}>
            {timelineHours.map(({ hour, checkIn }) => (
              <Pressable
                key={hour}
                disabled={!checkIn}
                accessibilityRole={checkIn ? 'button' : undefined}
                accessibilityLabel={checkIn ? `${hour}시 체크인` : undefined}
                testID={checkIn ? `daily-detail-timeline-${checkIn.id}` : `daily-detail-timeline-empty-${hour}`}
                onPress={() => checkIn && setSelectedCheckInId(checkIn.id)}
                style={[
                  styles.timelineSlot,
                  checkIn && styles.timelineSlotFilled,
                  checkIn?.id === selectedCheckInId && styles.timelineSlotSelected,
                ]}
              >
                <Text style={styles.timelineHour}>{String(hour).padStart(2, '0')}:00</Text>
              </Pressable>
            ))}
          </View>
        </>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#ffffff' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  message: { fontSize: 16, color: '#515151', textAlign: 'center' },
  retryButton: { borderRadius: 12, backgroundColor: '#2e6af0', paddingHorizontal: 20, paddingVertical: 14 },
  retryButtonText: { color: '#ffffff', fontSize: 16, fontWeight: '700' },
  header: { padding: 16, gap: 4 },
  title: { fontSize: 22, fontWeight: '700', color: '#1b1b1b' },
  subtitle: { fontSize: 14, color: '#8a8a8a' },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  emptyText: { fontSize: 16, color: '#515151' },
  map: { height: 260, marginHorizontal: 16, borderRadius: 16 },
  mapCaption: { fontSize: 12, color: '#8a8a8a', marginHorizontal: 16, marginTop: 6 },
  summary: { padding: 16, gap: 6 },
  summaryText: { fontSize: 14, color: '#1b1b1b' },
  timeline: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 12, gap: 8 },
  timelineSlot: { width: 64, paddingVertical: 8, alignItems: 'center', borderRadius: 8, borderWidth: 1, borderColor: 'transparent' },
  timelineSlotFilled: { backgroundColor: '#eef2ff' },
  timelineSlotSelected: { borderColor: '#2e6af0' },
  timelineHour: { fontSize: 12, color: '#1b1b1b' },
});
```

```tsx
// mobile/app/day/[date].tsx
import { useLocalSearchParams } from 'expo-router';

import { DailyDetailScreen } from '../../src/features/daily-reflection/DailyDetailScreen';

export default function DayRoute() {
  const { date } = useLocalSearchParams<{ date: string }>();
  return <DailyDetailScreen localDate={date} />;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest DailyDetailScreen.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add mobile/app/day/\[date\].tsx mobile/src/features/daily-reflection/DailyDetailScreen.tsx mobile/__tests__/DailyDetailScreen.test.tsx
git commit -m "feat(daily-reflection): 회고 상세 화면 지도·타임라인·하루 요약 렌더링"
```

---

## Task 12: 회고 본문 편집기 추가

**Files:**
- Modify: `mobile/src/features/daily-reflection/DailyDetailScreen.tsx`
- Modify: `mobile/__tests__/DailyDetailScreen.test.tsx`

**Interfaces:**
- Consumes: `useDailyReflectionDependencies` (Task 8), `saveDailyReflection` (Task 4)

- [ ] **Step 1: Add failing tests for the reflection editor**

Append to `describe('DailyDetailScreen', ...)` in `mobile/__tests__/DailyDetailScreen.test.tsx`. First, update the mocked `useDailyReflectionDependencies` at the top of the file so tests can inspect calls — replace the existing mock block with one that exposes the mock functions:

```ts
const mockReflectionRepository = { getByLocalDate: jest.fn(), save: jest.fn() };
const mockDraftRepository = { getDraft: jest.fn(), saveDraft: jest.fn(), clearDraft: jest.fn() };

jest.mock('../src/features/daily-reflection/DailyReflectionContext', () => ({
  useDailyReflectionDependencies: () => ({
    reflectionRepository: mockReflectionRepository,
    draftRepository: mockDraftRepository,
    uuid: () => 'new-reflection-id',
    now: () => '2026-08-16T20:00:00.000Z',
  }),
}));
```

Add `jest.useFakeTimers();` / `jest.useRealTimers();` around timer-dependent tests, and add these `it` blocks:

```ts
  it('auto-saves the draft while typing before completion, debounced', async () => {
    jest.useFakeTimers();
    mockReflectionRepository.getByLocalDate.mockResolvedValue(null);
    mockUseDailyDetail.mockReturnValue({
      state: { status: 'loaded', checkIns: [], reflection: null, draft: null, activityWindow: { startHour: 7, endHour: 23 } },
      reload: jest.fn(),
    });

    const view = render(<DailyDetailScreen localDate="2026-08-16" />);
    fireEvent.changeText(view.getByTestId('daily-detail-reflection-input'), '오늘은');

    act(() => { jest.advanceTimersByTime(499); });
    expect(mockDraftRepository.saveDraft).not.toHaveBeenCalled();

    act(() => { jest.advanceTimersByTime(1); });
    await waitFor(() => expect(mockDraftRepository.saveDraft).toHaveBeenCalledWith('2026-08-16', '오늘은'));

    jest.useRealTimers();
  });

  it('completes a reflection, clears the draft, and hides the 완료 button afterward', async () => {
    mockReflectionRepository.save.mockResolvedValue(undefined);
    mockReflectionRepository.getByLocalDate.mockResolvedValue(null);
    mockDraftRepository.clearDraft.mockResolvedValue(undefined);
    mockUseDailyDetail.mockReturnValue({
      state: { status: 'loaded', checkIns: [], reflection: null, draft: '오늘의 초안', activityWindow: { startHour: 7, endHour: 23 } },
      reload: jest.fn(),
    });

    const view = render(<DailyDetailScreen localDate="2026-08-16" />);
    expect(view.getByTestId('daily-detail-reflection-input').props.value).toBe('오늘의 초안');

    await fireEvent.press(view.getByRole('button', { name: '완료' }));

    await waitFor(() => expect(mockReflectionRepository.save).toHaveBeenCalledWith({
      id: 'new-reflection-id',
      localDate: '2026-08-16',
      body: '오늘의 초안',
      updatedAt: '2026-08-16T20:00:00.000Z',
    }));
    expect(mockDraftRepository.clearDraft).toHaveBeenCalledWith('2026-08-16');
    await waitFor(() => expect(view.queryByRole('button', { name: '완료' })).toBeNull());
  });

  it('keeps the entered body and shows an error message when completion fails', async () => {
    mockReflectionRepository.getByLocalDate.mockResolvedValue(null);
    mockReflectionRepository.save.mockRejectedValue(new Error('disk full'));
    mockUseDailyDetail.mockReturnValue({
      state: { status: 'loaded', checkIns: [], reflection: null, draft: null, activityWindow: { startHour: 7, endHour: 23 } },
      reload: jest.fn(),
    });

    const view = render(<DailyDetailScreen localDate="2026-08-16" />);
    fireEvent.changeText(view.getByTestId('daily-detail-reflection-input'), '실패할 회고');
    await fireEvent.press(view.getByRole('button', { name: '완료' }));

    await waitFor(() => expect(view.getByText('회고를 저장하지 못했어요. 다시 시도해 주세요.')).toBeTruthy());
    expect(view.getByTestId('daily-detail-reflection-input').props.value).toBe('실패할 회고');
  });

  it('prefills from a completed reflection rather than the draft, and has no 완료 button', () => {
    mockUseDailyDetail.mockReturnValue({
      state: {
        status: 'loaded',
        checkIns: [],
        reflection: { id: 'existing-id', localDate: '2026-08-16', body: '완료된 회고', updatedAt: '2026-08-16T10:00:00.000Z' },
        draft: '무시되어야 할 초안',
        activityWindow: { startHour: 7, endHour: 23 },
      },
      reload: jest.fn(),
    });

    const view = render(<DailyDetailScreen localDate="2026-08-16" />);

    expect(view.getByTestId('daily-detail-reflection-input').props.value).toBe('완료된 회고');
    expect(view.queryByRole('button', { name: '완료' })).toBeNull();
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest DailyDetailScreen.test.ts`
Expected: FAIL — no `daily-detail-reflection-input` testID or `완료` button exist yet.

- [ ] **Step 3: Extend `DailyDetailScreen.tsx` with the reflection editor**

Add imports:

```ts
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
```

```ts
import { useDailyReflectionDependencies } from './DailyReflectionContext';
import { saveDailyReflection } from './saveDailyReflection';
```

Inside `DailyDetailScreen`, after the existing `useDailyDetail`/`useState` calls and before the `if (state.status === 'loading')` guard, add:

```ts
  const { reflectionRepository, draftRepository, uuid, now } = useDailyReflectionDependencies();
  const [bodyText, setBodyText] = useState('');
  const [isCompleted, setIsCompleted] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (state.status !== 'loaded') return;
    setBodyText(state.reflection?.body ?? state.draft ?? '');
    setIsCompleted(state.reflection !== null);
  }, [state]);

  const onChangeBody = (text: string) => {
    setBodyText(text);
    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(() => {
      if (isCompleted) {
        void saveDailyReflection(localDate, text, { repository: reflectionRepository, uuid, now }).catch(() => {
          // Silently retried on the next debounce cycle.
        });
      } else {
        void draftRepository.saveDraft(localDate, text).catch(() => {
          // Silently retried on the next debounce cycle.
        });
      }
    }, 500);
  };

  const complete = async () => {
    setSaveError(null);
    try {
      await saveDailyReflection(localDate, bodyText, { repository: reflectionRepository, uuid, now });
      await draftRepository.clearDraft(localDate);
      setIsCompleted(true);
    } catch {
      setSaveError('회고를 저장하지 못했어요. 다시 시도해 주세요.');
    }
  };
```

Add a reflection section that always renders (both for the empty-state and normal branches). Replace the closing of the component's returned JSX — change:

```tsx
          </View>
        </>
      )}
    </SafeAreaView>
  );
}
```

to:

```tsx
          </View>
        </>
      )}

      <View style={styles.reflection}>
        <Text style={styles.reflectionLabel}>회고</Text>
        <TextInput
          testID="daily-detail-reflection-input"
          style={styles.reflectionInput}
          multiline
          placeholder="오늘 하루를 돌아보며 남기고 싶은 말을 적어보세요."
          value={bodyText}
          onChangeText={onChangeBody}
        />
        {!isCompleted && (
          <Pressable accessibilityRole="button" accessibilityLabel="완료" onPress={() => { void complete(); }} style={styles.completeButton}>
            <Text style={styles.completeButtonText}>완료</Text>
          </Pressable>
        )}
        {saveError && <Text style={styles.errorText}>{saveError}</Text>}
      </View>
    </SafeAreaView>
  );
}
```

Add the new styles to the `StyleSheet.create` call:

```ts
  reflection: { padding: 16, gap: 8 },
  reflectionLabel: { fontSize: 16, fontWeight: '700', color: '#1b1b1b' },
  reflectionInput: { minHeight: 96, borderRadius: 12, borderWidth: 1, borderColor: '#e5e7eb', padding: 12, fontSize: 15, color: '#1b1b1b', textAlignVertical: 'top' },
  completeButton: { alignSelf: 'flex-start', borderRadius: 10, backgroundColor: '#2e6af0', paddingHorizontal: 16, paddingVertical: 10 },
  completeButtonText: { color: '#ffffff', fontSize: 14, fontWeight: '700' },
  errorText: { fontSize: 13, color: '#c0392b' },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest DailyDetailScreen.test.ts`
Expected: PASS (all tests, including the 5 new ones)

- [ ] **Step 5: Run the full suite and typecheck**

Run: `npx jest && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add mobile/src/features/daily-reflection/DailyDetailScreen.tsx mobile/__tests__/DailyDetailScreen.test.tsx
git commit -m "feat(daily-reflection): 회고 본문 자동 임시 저장과 완료 흐름 추가"
```

---

## Task 13: "오늘의 발자국 보기" 연결 변경

**Files:**
- Modify: `mobile/app/check-in.tsx`
- Create: `mobile/__tests__/CheckInRoute.test.tsx`

**Interfaces:**
- Consumes: `localDateAndTimezone` (Task 2)

- [ ] **Step 1: Write the failing test**

```tsx
// mobile/__tests__/CheckInRoute.test.tsx
const mockReplace = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace }),
}));

jest.mock('../src/database/FootLogContext', () => ({
  useFootLogRepository: () => ({
    save: jest.fn().mockResolvedValue(undefined),
    listByLocalDay: jest.fn().mockResolvedValue([]),
    deleteById: jest.fn(),
    listLocalDatesWithCheckIns: jest.fn().mockResolvedValue([]),
  }),
}));

jest.mock('../src/features/check-in/ExpoLocationGateway', () => ({
  ExpoLocationGateway: jest.fn().mockImplementation(() => ({
    requestForegroundPermission: jest.fn().mockResolvedValue('granted'),
    getCurrentFix: jest.fn().mockResolvedValue({
      latitude: 37.5, longitude: 127.0, accuracyM: 10, capturedAt: '2026-08-16T09:00:00.000Z',
    }),
  })),
}));

import { fireEvent, render, waitFor } from '@testing-library/react-native';

import CheckInRoute from '../app/check-in';
import { localDateAndTimezone } from '../src/shared/localDate';

describe('CheckInRoute', () => {
  it('routes 오늘의 발자국 보기 to the day-detail screen for today', async () => {
    const view = render(<CheckInRoute />);

    await waitFor(() => expect(view.getByRole('button', { name: '이 위치에 체크인' })).toBeTruthy());
    await fireEvent.press(view.getByRole('button', { name: '이 위치에 체크인' }));
    await waitFor(() => expect(view.getByRole('button', { name: '오늘의 발자국 보기' })).toBeTruthy());

    await fireEvent.press(view.getByRole('button', { name: '오늘의 발자국 보기' }));

    expect(mockReplace).toHaveBeenCalledWith({
      pathname: '/day/[date]',
      params: { date: localDateAndTimezone().localDate },
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest CheckInRoute.test.ts`
Expected: FAIL — `onViewToday` still calls `router.replace('/')`, not the day route.

- [ ] **Step 3: Update `check-in.tsx`**

```tsx
// mobile/app/check-in.tsx
import * as Crypto from 'expo-crypto';
import { useRouter } from 'expo-router';
import { CheckInScreen } from '../src/features/check-in/CheckInScreen';
import { ExpoLocationGateway } from '../src/features/check-in/ExpoLocationGateway';
import { useFootLogRepository } from '../src/database/FootLogContext';
import { localDateAndTimezone } from '../src/shared/localDate';

export default function CheckInRoute() {
  const repository = useFootLogRepository();
  const router = useRouter();

  return (
    <CheckInScreen
      deps={{
        locationGateway: new ExpoLocationGateway(),
        repository,
        uuid: Crypto.randomUUID,
        now: () => new Date().toISOString(),
      }}
      onViewToday={() => router.replace({ pathname: '/day/[date]', params: { date: localDateAndTimezone().localDate } })}
    />
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest CheckInRoute.test.ts`
Expected: PASS

- [ ] **Step 5: Run the full suite to confirm no regression in `CheckInScreen.test.tsx`**

Run: `npx jest`
Expected: PASS — `CheckInScreen.test.tsx` only asserts that the `onViewToday` prop callback fires, so it is unaffected by what that callback now does.

- [ ] **Step 6: Commit**

```bash
git add mobile/app/check-in.tsx mobile/__tests__/CheckInRoute.test.tsx
git commit -m "feat(check-in): 오늘의 발자국 보기를 회고 상세 화면으로 연결"
```

---

## Task 14: 전체 검증

**Files:** 없음 (검증 전용 태스크)

- [ ] **Step 1: 모바일 자동 검사 전체 실행**

```bash
cd mobile
nvm use 24
npm test
npm run typecheck
npm run lint
npx expo-doctor
```

Expected: 넷 모두 통과. `typecheck`가 `/day/[date]` 라우트 타입을 인식하지 못하면(신규 동적 라우트라 `.expo/types/router.d.ts`가 아직 생성되지 않았을 수 있음), 먼저 아래를 한 번 실행해 타입을 생성한 뒤 다시 `npm run typecheck`를 실행한다.

```bash
npx expo start --dev-client
# 서버가 라우트 타입을 생성하면 Ctrl+C로 종료
```

- [ ] **Step 2: iOS 시뮬레이터에서 수동 확인**

```bash
npx expo run:ios --no-bundler
```

확인 항목:
- 캘린더 탭에서 월 이동(‹/›) 후 그리드가 올바르게 갱신되는지
- 체크인이 있는 날짜에 점이 표시되는지, 날짜를 누르면 회고 상세 화면으로 이동하는지
- 체크인이 없는 날은 "이날은 남겨진 발자국이 없어요"가 표시되고 회고 입력은 여전히 가능한지
- 체크인이 있는 날은 지도 핀·연결선·시간별 타임라인·하루 요약이 표시되고, 핀을 누르면 해당 타임라인 칸이 하이라이트되는지(그 반대도)
- 회고 본문을 입력하고 "완료"를 누르면 저장되고 버튼이 사라지는지, 화면을 나갔다 다시 들어와도 본문이 유지되는지
- 체크인 완료 화면에서 "오늘의 발자국 보기"를 누르면 오늘 날짜의 회고 상세 화면으로 이동하는지

- [ ] **Step 3: 최종 커밋 여부 확인**

Run: `git status`
Expected: 모든 변경이 이전 태스크들에서 이미 커밋되어 있고, working tree가 깨끗함. 수동 확인 중 발견된 문제를 고쳤다면 이 시점에 커밋한다.
