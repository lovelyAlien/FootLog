# FootLog Foundation and Local Check-in Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expo 개발 빌드에서 로컬 알림 또는 `지금 체크인`으로 진입해 현재 위치를 확인하고, 사용자가 확정한 체크인을 SQLite에 저장한 뒤 오늘 화면에서 다시 볼 수 있게 한다. Spring Boot/PostGIS는 다음 동기화 계획이 바로 확장할 수 있는 실행·테스트 골격까지 만든다.

**Architecture:** `mobile/`은 Expo Router 기반 UI와 기능별 모듈을 사용한다. 체크인 도메인은 Expo·SQLite를 직접 참조하지 않고 `LocationGateway`, `CheckInRepository` 포트에 의존하며, 어댑터가 `expo-location`과 `expo-sqlite`를 연결한다. `backend/`은 Spring Boot와 Flyway/PostGIS를 Testcontainers로 검증하되 이 계획에서는 동기화 API를 만들지 않는다.

**Tech Stack:** Expo SDK 57, React Native/TypeScript, Expo Router, Expo development build, `expo-location`, `expo-notifications`, `expo-sqlite`, `react-native-maps`, Jest + React Native Testing Library, Spring Boot 4.1.0, Java 21, Gradle 8.14.4 wrapper, PostgreSQL 17 + PostGIS 3.5, Flyway, JUnit 5, Testcontainers.

## Global Constraints

- 모바일은 Expo SDK 57의 개발 빌드로 구성한다. Expo Go 전용 흐름을 제품 경로로 사용하지 않는다.
- 지원 기준은 Android 7 이상, iOS 16.4 이상이다.
- 위치 권한은 앱 사용 중 권한만 요청한다. 백그라운드·상시 위치 권한과 실제 이동 경로 추적을 추가하지 않는다.
- 체크인은 첫 위치 좌표를 자동 저장하지 않는다. 지도 핀과 정확도를 표시한 뒤 사용자가 `이 위치에 체크인`을 눌러야 저장한다.
- 위치가 의심스러울 때는 `다시 찾기`만 제공한다. 핀 수동 이동과 과거 시각 체크인은 제공하지 않는다.
- 체크인은 네트워크보다 먼저 SQLite에 저장한다. 이 계획에서는 로그인, 원격 동기화, 사진, 메모, 일일 회고 본문, 주간 발견을 구현하지 않는다.
- 위치 기록 행위와 코드 이름은 `check-in`, `CheckIn`, `check_ins`를 사용한다. `capture`를 사용하지 않는다.
- 식별자는 클라이언트에서 UUID v4로 생성한다. 시각은 DB와 도메인에서 UTC ISO-8601 문자열로 보관하고 UI에서 기기 시간대로 표시한다.
- 커밋 메시지는 `type(scope): 한글 설명` 형식을 사용한다.

---

## File Structure

```text
FootLog/
├── mobile/
│   ├── app/
│   │   ├── _layout.tsx                  # SQLite 초기화와 최상위 Stack
│   │   ├── (tabs)/_layout.tsx           # 오늘/캘린더/발견 탭 골격
│   │   ├── (tabs)/index.tsx             # 오늘의 체크인 목록과 진입 버튼
│   │   ├── (tabs)/calendar.tsx          # 후속 계획용 빈 상태
│   │   ├── (tabs)/discovery.tsx         # 후속 계획용 빈 상태
│   │   └── check-in.tsx                 # 위치 확인·확정·완료 화면
│   ├── src/
│   │   ├── database/migrate.ts          # SQLite 스키마 버전과 마이그레이션
│   │   ├── database/openDatabase.ts      # 단일 DB 연결
│   │   ├── features/check-in/domain.ts  # 도메인 타입과 포트
│   │   ├── features/check-in/createCheckIn.ts
│   │   ├── features/check-in/checkInReducer.ts
│   │   ├── features/check-in/ExpoLocationGateway.ts
│   │   ├── features/check-in/SQLiteCheckInRepository.ts
│   │   ├── features/check-in/useCheckIn.ts
│   │   ├── features/check-in/CheckInScreen.tsx
│   │   ├── features/check-in/TodayCheckIns.tsx
│   │   ├── features/notifications/notificationSchedule.ts
│   │   ├── features/notifications/ExpoNotificationScheduler.ts
│   │   ├── features/notifications/NotificationSettingsScreen.tsx
│   │   ├── features/settings/AppSettingsRepository.ts
│   │   └── test/renderWithDatabase.tsx
│   ├── __tests__/                       # 모바일 단위·컴포넌트 테스트
│   ├── app.config.ts
│   ├── eas.json
│   ├── jest.setup.ts
│   └── package.json
├── backend/
│   ├── src/main/java/com/footlog/api/FootLogApplication.java
│   ├── src/main/resources/application.yml
│   ├── src/main/resources/db/migration/V1__enable_postgis.sql
│   ├── src/test/java/com/footlog/api/PostgisContextTest.java
│   ├── build.gradle
│   ├── settings.gradle
│   └── gradle/wrapper/
└── compose.yaml                          # 로컬 PostgreSQL/PostGIS
```

## Task 1: Expo 개발 빌드와 테스트 골격

**Files:**
- Create: `mobile/**` via Expo template
- Modify: `mobile/app.config.ts`
- Create: `mobile/eas.json`
- Modify: `mobile/package.json`
- Create: `mobile/jest.setup.ts`
- Test: `mobile/__tests__/smoke.test.ts`

**Interfaces:**
- Consumes: none
- Produces: Expo Router 앱, `npm test`, `npm run lint`, `npm run typecheck`, development build profile

- [ ] **Step 1: Scaffold the SDK 57 app without overwriting repository docs**

Run from the repository root:

```bash
npx create-expo-app@latest mobile --template default@sdk-57 --yes --no-agents-md
cd mobile
npx expo install expo-dev-client expo-location expo-notifications expo-sqlite expo-crypto react-native-maps
npm install @date-fns/tz
npm install --save-dev jest jest-expo @testing-library/react-native @types/jest
```

Expected: `mobile/package.json` contains Expo SDK 57-compatible versions selected by `expo install`.

- [ ] **Step 2: Add explicit quality scripts**

Set these keys in `mobile/package.json`:

```json
{
  "scripts": {
    "start": "expo start --dev-client",
    "android": "expo run:android",
    "ios": "expo run:ios",
    "lint": "expo lint",
    "typecheck": "tsc --noEmit",
    "test": "jest --runInBand"
  },
  "jest": {
    "preset": "jest-expo",
    "setupFilesAfterEnv": ["<rootDir>/jest.setup.ts"]
  }
}
```

- [ ] **Step 3: Configure app identifiers and only foreground location permission**

Replace the generated app config with `mobile/app.config.ts`:

```ts
import type { ExpoConfig } from 'expo/config';

const config: ExpoConfig = {
  name: 'FootLog',
  slug: 'footlog',
  scheme: 'footlog',
  version: '0.1.0',
  orientation: 'portrait',
  ios: {
    bundleIdentifier: 'com.footlog.app',
    supportsTablet: false,
    infoPlist: {
      NSLocationWhenInUseUsageDescription:
        '체크인할 현재 위치를 확인하기 위해 위치 권한이 필요합니다.',
    },
  },
  android: {
    package: 'com.footlog.app',
    permissions: ['ACCESS_COARSE_LOCATION', 'ACCESS_FINE_LOCATION'],
  },
  plugins: [
    'expo-router',
    'expo-dev-client',
    ['expo-location', { locationWhenInUsePermission: '체크인할 현재 위치를 확인하기 위해 위치 권한이 필요합니다.' }],
    ['expo-notifications', { defaultChannel: 'hourly-check-ins' }],
  ],
  experiments: { typedRoutes: true },
};

export default config;
```

Verify that neither `NSLocationAlwaysUsageDescription` nor Android background location permission is present.

- [ ] **Step 4: Configure development builds**

Create `mobile/eas.json`:

```json
{
  "cli": { "version": ">= 16.0.0" },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal"
    },
    "preview": { "distribution": "internal" },
    "production": { "autoIncrement": true }
  }
}
```

- [ ] **Step 5: Write and run a smoke test**

Create `mobile/__tests__/smoke.test.ts`:

```ts
describe('mobile test environment', () => {
  it('runs TypeScript tests', () => {
    expect('check-in').toBe('check-in');
  });
});
```

Run:

```bash
cd mobile
npm test -- --runTestsByPath __tests__/smoke.test.ts
npm run typecheck
npm run lint
```

Expected: all three commands pass.

- [ ] **Step 6: Commit**

```bash
git add mobile
git commit -m "chore(mobile): Expo 개발 빌드 기반 추가"
```

## Task 2: 체크인 도메인과 사용자 확정 규칙

**Files:**
- Create: `mobile/src/features/check-in/domain.ts`
- Create: `mobile/src/features/check-in/createCheckIn.ts`
- Create: `mobile/src/features/check-in/checkInReducer.ts`
- Test: `mobile/__tests__/checkInReducer.test.ts`
- Test: `mobile/__tests__/createCheckIn.test.ts`

**Interfaces:**
- Consumes: none
- Produces: `LocationFix`, `CheckIn`, `CheckInRepository`, `LocationGateway`, `createCheckIn()`, `checkInReducer()`

- [ ] **Step 1: Write failing state-machine tests**

Create `mobile/__tests__/checkInReducer.test.ts`:

```ts
import { checkInReducer, initialCheckInState } from '../src/features/check-in/checkInReducer';

const fix = {
  latitude: 37.5445,
  longitude: 127.056,
  accuracyM: 42,
  capturedAt: '2026-08-06T00:00:00.000Z',
};

describe('checkInReducer', () => {
  it('does not become confirmable before a location fix exists', () => {
    expect(checkInReducer(initialCheckInState, { type: 'SEARCH_STARTED' })).toEqual({ status: 'locating' });
  });

  it('requires explicit confirmation after finding a location', () => {
    const ready = checkInReducer({ status: 'locating' }, { type: 'LOCATION_FOUND', fix });
    expect(ready).toEqual({ status: 'ready', fix });
  });

  it('shows the persisted check-in only after save succeeds', () => {
    const saving = checkInReducer({ status: 'ready', fix }, { type: 'CONFIRM_PRESSED' });
    expect(saving).toEqual({ status: 'saving', fix });
  });
});
```

- [ ] **Step 2: Run the reducer test and verify failure**

Run: `cd mobile && npm test -- --runTestsByPath __tests__/checkInReducer.test.ts`

Expected: FAIL because `checkInReducer` does not exist.

- [ ] **Step 3: Define domain ports and reducer**

Create `mobile/src/features/check-in/domain.ts`:

```ts
export type LocationFix = {
  latitude: number;
  longitude: number;
  accuracyM: number;
  capturedAt: string;
};

export class LocationFixError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LocationFixError';
  }
}

export type CheckIn = LocationFix & {
  id: string;
  checkedInAt: string;
  createdAt: string;
  syncStatus: 'pending';
};

export interface LocationGateway {
  requestForegroundPermission(): Promise<'granted' | 'denied'>;
  getCurrentFix(): Promise<LocationFix>;
}

export interface CheckInRepository {
  save(checkIn: CheckIn): Promise<void>;
  listByLocalDay(localDate: string, timezone: string): Promise<CheckIn[]>;
  deleteById(id: string): Promise<void>;
}
```

Create `mobile/src/features/check-in/checkInReducer.ts` with the exhaustive union:

```ts
import type { CheckIn, LocationFix } from './domain';

export type CheckInState =
  | { status: 'idle' }
  | { status: 'locating' }
  | { status: 'ready'; fix: LocationFix }
  | { status: 'saving'; fix: LocationFix }
  | { status: 'complete'; checkIn: CheckIn }
  | { status: 'permission-denied' }
  | { status: 'error'; message: string };

export type CheckInAction =
  | { type: 'SEARCH_STARTED' }
  | { type: 'LOCATION_FOUND'; fix: LocationFix }
  | { type: 'LOCATION_FAILED'; message: string }
  | { type: 'PERMISSION_DENIED' }
  | { type: 'CONFIRM_PRESSED' }
  | { type: 'SAVE_SUCCEEDED'; checkIn: CheckIn };

export const initialCheckInState: CheckInState = { status: 'idle' };

export function checkInReducer(state: CheckInState, action: CheckInAction): CheckInState {
  switch (action.type) {
    case 'SEARCH_STARTED': return { status: 'locating' };
    case 'LOCATION_FOUND': return { status: 'ready', fix: action.fix };
    case 'LOCATION_FAILED': return { status: 'error', message: action.message };
    case 'PERMISSION_DENIED': return { status: 'permission-denied' };
    case 'CONFIRM_PRESSED':
      return state.status === 'ready' ? { status: 'saving', fix: state.fix } : state;
    case 'SAVE_SUCCEEDED': return { status: 'complete', checkIn: action.checkIn };
  }
}
```

- [ ] **Step 4: Write the failing create use-case tests**

Create `mobile/__tests__/createCheckIn.test.ts` with a fake repository and injected UUID/clock. Assert that `save()` receives one `CheckIn`, that `checkedInAt` uses the confirmation clock rather than `capturedAt`, and that the result has `syncStatus: 'pending'`.

```ts
expect(saved).toEqual({
  id: '11111111-1111-4111-8111-111111111111',
  latitude: 37.5445,
  longitude: 127.056,
  accuracyM: 42,
  capturedAt: '2026-08-06T00:00:00.000Z',
  checkedInAt: '2026-08-06T00:00:03.000Z',
  createdAt: '2026-08-06T00:00:03.000Z',
  syncStatus: 'pending',
});
```

- [ ] **Step 5: Implement the minimal use case**

Create `mobile/src/features/check-in/createCheckIn.ts`:

```ts
import type { CheckIn, CheckInRepository, LocationFix } from './domain';

type Dependencies = {
  repository: CheckInRepository;
  uuid: () => string;
  now: () => string;
};

export async function createCheckIn(fix: LocationFix, deps: Dependencies): Promise<CheckIn> {
  const now = deps.now();
  const checkIn: CheckIn = {
    ...fix,
    id: deps.uuid(),
    checkedInAt: now,
    createdAt: now,
    syncStatus: 'pending',
  };
  await deps.repository.save(checkIn);
  return checkIn;
}
```

- [ ] **Step 6: Run tests and commit**

Run: `cd mobile && npm test -- --runTestsByPath __tests__/checkInReducer.test.ts __tests__/createCheckIn.test.ts`

Expected: PASS.

```bash
git add mobile/src/features/check-in mobile/__tests__/checkInReducer.test.ts mobile/__tests__/createCheckIn.test.ts
git commit -m "feat(check-in): 사용자 확정 체크인 도메인 추가"
```

## Task 3: SQLite 마이그레이션과 체크인 저장소

**Files:**
- Create: `mobile/src/database/openDatabase.ts`
- Create: `mobile/src/database/migrate.ts`
- Create: `mobile/src/features/check-in/SQLiteCheckInRepository.ts`
- Test: `mobile/__tests__/migrate.test.ts`
- Test: `mobile/__tests__/SQLiteCheckInRepository.test.ts`

**Interfaces:**
- Consumes: `CheckIn`, `CheckInRepository`
- Produces: `openFootLogDatabase()`, `migrateDatabase(db)`, `SQLiteCheckInRepository`

- [ ] **Step 1: Write failing migration and repository tests**

Mock the narrow `SQLiteDatabase` methods used by these modules: `getFirstAsync`, `execAsync`, `withTransactionAsync`, `runAsync`, and `getAllAsync`. Assert that migration is idempotent, executes the version-1 schema exactly once, and sets `PRAGMA user_version = 1`. Task 9 verifies the real native SQLite binary because Jest does not load it.

Repository tests must save two rows spanning a UTC date boundary and verify `listByLocalDay('2026-08-06', 'Asia/Seoul')` binds `2026-08-05T15:00:00.000Z` inclusive and `2026-08-06T15:00:00.000Z` exclusive, then maps returned rows in ascending order. Also verify `deleteById()` removes only its target.

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
cd mobile
npm test -- --runTestsByPath __tests__/migrate.test.ts __tests__/SQLiteCheckInRepository.test.ts
```

Expected: FAIL because database modules do not exist.

- [ ] **Step 3: Implement the version-1 schema**

Create `mobile/src/database/migrate.ts` and execute this transaction when `user_version < 1`:

```sql
PRAGMA journal_mode = WAL;
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
```

Use `db.withTransactionAsync()` and parameterized `runAsync()`/`getAllAsync()` calls. Do not interpolate user or time values into SQL.

- [ ] **Step 4: Implement the repository**

`SQLiteCheckInRepository` receives a `SQLiteDatabase`. For local-day queries, parse the `YYYY-MM-DD` components and use `TZDate` from `@date-fns/tz` to create local midnight and the next local midnight in the supplied IANA timezone. Convert both to UTC ISO strings, then execute:

```sql
SELECT * FROM check_ins
WHERE checked_in_at >= ? AND checked_in_at < ?
ORDER BY checked_in_at ASC;
```

Map snake_case rows to the exact `CheckIn` fields from Task 2.

- [ ] **Step 5: Run tests and commit**

Run:

```bash
cd mobile
npm test -- --runTestsByPath __tests__/migrate.test.ts __tests__/SQLiteCheckInRepository.test.ts
npm run typecheck
```

Expected: PASS.

```bash
git add mobile/src/database mobile/src/features/check-in/SQLiteCheckInRepository.ts mobile/__tests__
git commit -m "feat(storage): 로컬 체크인 저장소 추가"
```

## Task 4: Expo 현재 위치 어댑터

**Files:**
- Create: `mobile/src/features/check-in/ExpoLocationGateway.ts`
- Test: `mobile/__tests__/ExpoLocationGateway.test.ts`

**Interfaces:**
- Consumes: `LocationGateway`, `LocationFix`
- Produces: `ExpoLocationGateway`

- [ ] **Step 1: Write failing adapter tests with a mocked Expo Location module**

Cover these cases:

```ts
it('maps foreground permission denial to denied');
it('requests a fresh high-accuracy position rather than last known position');
it('rejects null or negative accuracy as an invalid fix');
it('returns ISO capturedAt from the native timestamp');
```

The successful expectation is:

```ts
expect(await gateway.getCurrentFix()).toEqual({
  latitude: 37.5445,
  longitude: 127.056,
  accuracyM: 42,
  capturedAt: '2026-08-06T00:00:00.000Z',
});
```

- [ ] **Step 2: Run and verify failure**

Run: `cd mobile && npm test -- --runTestsByPath __tests__/ExpoLocationGateway.test.ts`

Expected: FAIL because the adapter does not exist.

- [ ] **Step 3: Implement foreground-only current-position lookup**

The adapter must call:

```ts
Location.requestForegroundPermissionsAsync();
Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Highest });
```

It must never call `requestBackgroundPermissionsAsync`, `startLocationUpdatesAsync`, or `getLastKnownPositionAsync`. Reject non-finite coordinates, null/negative accuracy, and invalid timestamps with `LocationFixError`.

- [ ] **Step 4: Run tests, scan forbidden APIs, and commit**

Run:

```bash
cd mobile
npm test -- --runTestsByPath __tests__/ExpoLocationGateway.test.ts
rg "requestBackgroundPermissionsAsync|startLocationUpdatesAsync|getLastKnownPositionAsync" src
```

Expected: tests PASS and `rg` returns no matches.

```bash
git add mobile/src/features/check-in/ExpoLocationGateway.ts mobile/__tests__/ExpoLocationGateway.test.ts
git commit -m "feat(location): 포그라운드 위치 확인 추가"
```

## Task 5: 체크인 화면과 지도 확인 UI

**Files:**
- Create: `mobile/src/features/check-in/useCheckIn.ts`
- Create: `mobile/src/features/check-in/CheckInScreen.tsx`
- Create: `mobile/app/check-in.tsx`
- Test: `mobile/__tests__/CheckInScreen.test.tsx`

**Interfaces:**
- Consumes: `LocationGateway`, `CheckInRepository`, `createCheckIn()`, `checkInReducer()`
- Produces: `useCheckIn(deps)`, `CheckInScreen`

- [ ] **Step 1: Write failing component tests**

Inject fake gateway and repository dependencies. Test all visible states:

```ts
it('shows 현재 위치 확인 중 and no enabled save button while locating');
it('shows a map pin, 정확도 약 42m, 다시 찾기, and 이 위치에 체크인 when ready');
it('does not save until 이 위치에 체크인 is pressed');
it('shows settings guidance after permission denial');
it('shows retry after location failure');
it('shows 완료 and 오늘의 발자국 보기 after local save');
```

- [ ] **Step 2: Run and verify failure**

Run: `cd mobile && npm test -- --runTestsByPath __tests__/CheckInScreen.test.tsx`

Expected: FAIL because `CheckInScreen` does not exist.

- [ ] **Step 3: Implement the controller hook**

`useCheckIn()` must expose:

```ts
type UseCheckInResult = {
  state: CheckInState;
  findLocation(): Promise<void>;
  confirm(): Promise<void>;
};
```

On mount, `CheckInScreen` calls `findLocation()`. `confirm()` is a no-op unless state is `ready`; this preserves the explicit-confirmation rule even if a button event fires twice.

- [ ] **Step 4: Implement the screen**

For `ready`, render a non-draggable `MapView` and `Marker`, plus a circle whose radius equals `fix.accuracyM`. Keep `이 위치에 체크인` as the only primary action. `다시 찾기` calls `findLocation()` and never saves.

For `complete`, render `완료` and `오늘의 발자국 보기`. Do not automatically navigate away.

`mobile/app/check-in.tsx` resolves production adapters and renders `CheckInScreen`. Pass `Crypto.randomUUID` from `expo-crypto` as the UUID dependency and `() => new Date().toISOString()` as the clock. Keep dependency construction in this route file, not inside the presentational component.

- [ ] **Step 5: Run tests and commit**

Run:

```bash
cd mobile
npm test -- --runTestsByPath __tests__/CheckInScreen.test.tsx
npm run typecheck
npm run lint
```

Expected: PASS.

```bash
git add mobile/app/check-in.tsx mobile/src/features/check-in mobile/__tests__/CheckInScreen.test.tsx
git commit -m "feat(check-in): 위치 확인과 확정 화면 추가"
```

## Task 6: 오늘 화면과 앱 초기화

**Files:**
- Modify: `mobile/app/_layout.tsx`
- Modify: `mobile/app/(tabs)/_layout.tsx`
- Modify: `mobile/app/(tabs)/index.tsx`
- Create: `mobile/app/(tabs)/calendar.tsx`
- Create: `mobile/app/(tabs)/discovery.tsx`
- Create: `mobile/src/features/check-in/TodayCheckIns.tsx`
- Test: `mobile/__tests__/TodayCheckIns.test.tsx`

**Interfaces:**
- Consumes: `migrateDatabase()`, `CheckInRepository.listByLocalDay()`
- Produces: initialized root layout, Today tab, `TodayCheckIns`

- [ ] **Step 1: Write failing Today tests**

Test:

```ts
it('shows 지금 체크인 when today has no records');
it('shows today check-ins in chronological order with local times and accuracy');
it('opens /check-in from 지금 체크인');
it('refreshes after the check-in route regains focus');
```

- [ ] **Step 2: Run and verify failure**

Run: `cd mobile && npm test -- --runTestsByPath __tests__/TodayCheckIns.test.tsx`

Expected: FAIL because the component does not exist.

- [ ] **Step 3: Initialize SQLite before routes render**

In `mobile/app/_layout.tsx`, open the single FootLog database, await `migrateDatabase()`, and render a deterministic loading state until migration succeeds. Render an error with `다시 시도` if migration fails. Provide the repository through a small React context so all route files use the same connection.

- [ ] **Step 4: Implement tabs and Today content**

Tabs are `오늘`, `캘린더`, `발견`. Calendar and Discovery show honest future-scope empty states, not fabricated data.

`TodayCheckIns` receives:

```ts
type TodayCheckInsProps = {
  checkIns: CheckIn[];
  onStartCheckIn: () => void;
};
```

The Today route reloads `listByLocalDay()` whenever it gains focus and navigates to `/check-in` from its primary button.

- [ ] **Step 5: Run tests and commit**

Run:

```bash
cd mobile
npm test -- --runTestsByPath __tests__/TodayCheckIns.test.tsx
npm run typecheck
npm run lint
```

Expected: PASS.

```bash
git add mobile/app mobile/src/features/check-in/TodayCheckIns.tsx mobile/__tests__/TodayCheckIns.test.tsx
git commit -m "feat(today): 오늘의 로컬 체크인 목록 추가"
```

## Task 7: 활동 시간 기반 로컬 체크인 알림

**Files:**
- Create: `mobile/src/features/notifications/notificationSchedule.ts`
- Create: `mobile/src/features/notifications/ExpoNotificationScheduler.ts`
- Create: `mobile/src/features/notifications/NotificationSettingsScreen.tsx`
- Create: `mobile/src/features/settings/AppSettingsRepository.ts`
- Create: `mobile/app/settings/reminders.tsx`
- Test: `mobile/__tests__/notificationSchedule.test.ts`
- Test: `mobile/__tests__/ExpoNotificationScheduler.test.ts`
- Test: `mobile/__tests__/NotificationSettingsScreen.test.tsx`

**Interfaces:**
- Consumes: Expo Notifications, Expo Router `/check-in`
- Produces: `buildHourlyCheckInTimes()`, `ExpoNotificationScheduler.reschedule()`, persisted `NotificationSettings`

- [ ] **Step 1: Write failing pure schedule tests**

Define:

```ts
type ActivityWindow = { startHour: number; endHour: number };

buildHourlyCheckInTimes({
  now: new Date('2026-08-06T08:32:00+09:00'),
  window: { startHour: 7, endHour: 23 },
  days: 2,
});
```

Assert that results begin at `09:00`, include each whole hour through `23:00`, include the next day's `07:00` through `23:00`, and never include a past time. Add cases for `now` exactly on the hour and a timezone-offset change. Reject windows where `startHour >= endHour`; overnight activity windows are outside this MVP.

- [ ] **Step 2: Run and verify failure**

Run: `cd mobile && npm test -- --runTestsByPath __tests__/notificationSchedule.test.ts`

Expected: FAIL because the function does not exist.

- [ ] **Step 3: Implement the pure scheduler**

Implement `buildHourlyCheckInTimes()` without reading global time or timezone. Return `Date[]` sorted ascending. Generate calendar hours in the supplied `now` locale rather than adding fixed 60-minute milliseconds across days.

- [ ] **Step 4: Write failing Expo scheduler tests**

Mock Expo Notifications and assert:

- foreground notification permission is requested only when enabling reminders;
- existing FootLog notification identifiers are canceled before rebuilding;
- each scheduled notification has `data: { url: '/check-in', kind: 'hourly-check-in' }`;
- Android channel id is `hourly-check-ins`;
- denial returns `{ status: 'denied' }` without scheduling.

- [ ] **Step 5: Implement and connect notification routing**

Define and persist this value under the `hourly_notification_settings` key in `app_settings`:

```ts
type NotificationSettings = {
  enabled: boolean;
  startHour: number;
  endHour: number;
  scheduledIds: string[];
};
```

`AppSettingsRepository` validates decoded JSON. Missing or invalid data returns `{ enabled: false, startHour: 7, endHour: 23, scheduledIds: [] }`.

`ExpoNotificationScheduler.reschedule(window)` schedules the next two local calendar days. Persist returned identifiers so only FootLog-owned schedules are canceled.

At root navigation initialization, inspect the last notification response and subscribe to new responses. Navigate to `/check-in` only when `data.kind === 'hourly-check-in'` and `data.url === '/check-in'`.

- [ ] **Step 6: Add the activity-window settings screen**

Write `NotificationSettingsScreen.test.tsx` before implementation. Assert that the initial state is disabled with `07:00`–`23:00`, enabling calls `reschedule()`, permission denial returns the switch to off with an explanation, changing an hour rebuilds schedules, and disabling cancels only the stored identifiers.

Implement one enable switch and start/end selectors limited to whole hours `00:00`–`23:00`. Disable saving when `startHour >= endHour` and show `종료 시간은 시작 시간보다 늦어야 해요`. Add the `/settings/reminders` route and link it from the Today header settings action.

- [ ] **Step 7: Run tests and commit**

Run:

```bash
cd mobile
npm test -- --runTestsByPath __tests__/notificationSchedule.test.ts __tests__/ExpoNotificationScheduler.test.ts __tests__/NotificationSettingsScreen.test.tsx
npm run typecheck
```

Expected: PASS.

```bash
git add mobile/src/features/notifications mobile/src/features/settings mobile/__tests__ mobile/app/_layout.tsx mobile/app/settings/reminders.tsx
git commit -m "feat(notifications): 활동 시간 체크인 알림 추가"
```

## Task 8: Spring Boot와 PostGIS 실행 골격

**Files:**
- Modify: `.gitignore`
- Create: `backend/settings.gradle`
- Create: `backend/build.gradle`
- Create: `backend/src/main/java/com/footlog/api/FootLogApplication.java`
- Create: `backend/src/main/resources/application.yml`
- Create: `backend/src/main/resources/db/migration/V1__enable_postgis.sql`
- Create: `backend/src/test/java/com/footlog/api/PostgisContextTest.java`
- Create: `compose.yaml`

**Interfaces:**
- Consumes: Docker-compatible runtime for integration tests
- Produces: Spring Boot application, Flyway migration, verified PostGIS datasource

- [ ] **Step 1: Generate a Gradle 8.14.4 wrapper and define the build**

Create `backend/settings.gradle`:

```groovy
rootProject.name = 'footlog-api'
```

Create `backend/build.gradle`:

```groovy
plugins {
  id 'java'
  id 'org.springframework.boot' version '4.1.0'
}

group = 'com.footlog'
version = '0.1.0-SNAPSHOT'

java { toolchain { languageVersion = JavaLanguageVersion.of(21) } }

repositories { mavenCentral() }

dependencies {
  implementation 'org.springframework.boot:spring-boot-starter-web'
  implementation 'org.springframework.boot:spring-boot-starter-actuator'
  implementation 'org.springframework.boot:spring-boot-starter-jdbc'
  implementation 'org.flywaydb:flyway-core'
  implementation 'org.flywaydb:flyway-database-postgresql'
  runtimeOnly 'org.postgresql:postgresql'
  testImplementation 'org.springframework.boot:spring-boot-starter-test'
  testImplementation 'org.springframework.boot:spring-boot-testcontainers'
  testImplementation 'org.testcontainers:junit-jupiter'
  testImplementation 'org.testcontainers:postgresql'
}

tasks.named('test') { useJUnitPlatform() }
```

Run: `cd backend && gradle wrapper --gradle-version 8.14.4`

- [ ] **Step 2: Write a failing PostGIS context test**

Create `PostgisContextTest.java` using `PostgreSQLContainer<?>` with image `postgis/postgis:17-3.5`. Register datasource properties through `@DynamicPropertySource`. Assert:

```java
assertThat(jdbcTemplate.queryForObject(
    "select postgis_version()", String.class)).isNotBlank();
assertThat(jdbcTemplate.queryForObject(
    "select count(*) from flyway_schema_history", Integer.class)).isGreaterThan(0);
```

- [ ] **Step 3: Run and verify failure**

Run: `cd backend && ./gradlew test --tests '*PostgisContextTest'`

Expected: FAIL because the application and migration do not exist.

- [ ] **Step 4: Add application, configuration, and migration**

`FootLogApplication.java` is a standard `@SpringBootApplication` entry point.

Create `application.yml`:

```yaml
spring:
  datasource:
    url: ${DATABASE_URL:jdbc:postgresql://localhost:5432/footlog}
    username: ${DATABASE_USER:footlog}
    password: ${DATABASE_PASSWORD:footlog}
  flyway:
    enabled: true
management:
  endpoints:
    web:
      exposure:
        include: health,info
```

Create `V1__enable_postgis.sql`:

```sql
CREATE EXTENSION IF NOT EXISTS postgis;
```

Create root `compose.yaml` with `postgis/postgis:17-3.5`, database/user/password `footlog`, port `5432`, a named volume, and a health check using `pg_isready -U footlog`.

Append these generated paths to the root `.gitignore`:

```gitignore
backend/.gradle/
backend/build/
```

- [ ] **Step 5: Run backend tests and boot smoke check**

Run:

```bash
cd backend
./gradlew test
./gradlew bootJar
```

Expected: tests PASS and `backend/build/libs/footlog-api-0.1.0-SNAPSHOT.jar` exists.

- [ ] **Step 6: Commit**

```bash
git add .gitignore backend compose.yaml
git commit -m "chore(backend): Spring PostGIS 기반 추가"
```

## Task 9: End-to-End Verification and Developer Handoff

**Files:**
- Create: `docs/testing/foundation-local-checkin-qa.md`
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: Tasks 1-8
- Produces: reproducible build/test commands and real-device QA evidence checklist

- [ ] **Step 1: Run all automated checks**

Run:

```bash
cd mobile
npm test
npm run typecheck
npm run lint
npx expo-doctor
cd ../backend
./gradlew test
./gradlew bootJar
```

Expected: every command exits 0.

- [ ] **Step 2: Build and run a development client on both platforms**

Run on available local simulators/devices:

```bash
cd mobile
npx expo run:ios
npx expo run:android
```

If one platform cannot run on the current machine, record the exact unavailable tool/device requirement in the QA document; do not mark that platform verified.

- [ ] **Step 3: Execute the real-device location and notification checklist**

Create `docs/testing/foundation-local-checkin-qa.md` with checkboxes for:

```markdown
- [ ] 첫 실행에서 앱 사용 중 위치 권한만 요청한다.
- [ ] 위치 확인 중에는 저장 버튼이 활성화되지 않는다.
- [ ] 위치 준비 후 핀과 정확도 반경이 표시된다.
- [ ] 저장 전에는 오늘 목록에 행이 생성되지 않는다.
- [ ] 다시 찾기는 위치만 갱신하고 저장하지 않는다.
- [ ] 이 위치에 체크인을 누르면 오프라인에서도 완료된다.
- [ ] 완료 화면에서 강제 이동하지 않는다.
- [ ] 오늘의 발자국 보기로 오늘 목록을 확인할 수 있다.
- [ ] 앱 재시작 후에도 체크인이 남아 있다.
- [ ] 로컬 알림을 누르면 체크인 화면이 열린다.
- [ ] 알림 거부 후에도 지금 체크인을 사용할 수 있다.
- [ ] iOS에서 Always 권한 문구가 나타나지 않는다.
- [ ] Android에서 백그라운드 위치 권한이 나타나지 않는다.
```

- [ ] **Step 4: Update project commands and scope**

Add exact mobile start/test and backend test/run commands to `CLAUDE.md`. Mark implemented scope as foundation + local check-in only; keep sync, media, reflection, and discovery explicitly pending.

- [ ] **Step 5: Commit the verified slice**

```bash
git add docs/testing/foundation-local-checkin-qa.md CLAUDE.md
git commit -m "docs(qa): 로컬 체크인 검증 절차 추가"
```

## Completion Gate

This plan is complete only when:

- automated mobile and backend checks pass;
- a development build demonstrates explicit-confirmation local check-in on at least one physical device;
- no background location permission or API exists;
- an offline check-in survives app restart;
- a local notification opens `/check-in`;
- unsupported platform verification is documented honestly;
- the Git worktree is clean after the final commit.

After completion, write the next independent plan for authentication and idempotent check-in synchronization. Do not add remote sync opportunistically to this plan.
