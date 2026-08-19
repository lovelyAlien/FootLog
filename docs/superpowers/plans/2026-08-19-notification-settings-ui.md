# 알림 설정 화면 개선 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `NotificationSettingsScreen`(매시간 체크인 알림 설정)을 프리셋 칩 + 듀얼 핸들 레인지 슬라이더 기반 조작, 1/2/3시간 알림 간격 선택, "즉시 적용"(저장 버튼 제거) 상호작용 모델로 재구성한다.

**Architecture:** 기존 계층(순수 로직 함수 → 저장소/스케줄러 → 화면 컴포넌트)을 그대로 따른다. `AppSettingsRepository`에 `intervalHours` 필드를 추가하고, `notificationSchedule.ts`의 스케줄 계산과 `ExpoNotificationScheduler`가 이를 받아들이도록 확장한다. 슬라이더는 새 라이브러리를 추가하지 않고 이미 설치된 `react-native`의 `PanResponder`와 순수 기하 계산 함수(`activityWindowGeometry.ts`)로 구현하며, 스크린리더 사용자를 위해 `accessibilityRole="adjustable"` 증감 액션을 함께 제공한다.

**Tech Stack:** React Native(Expo SDK ~57), TypeScript, `@testing-library/react-native`, Jest(`jest-expo`).

## Global Constraints

- 모바일 명령은 `cd mobile && nvm use 24`로 Node.js 24에서 실행한다.
- 회고 화면의 1시간 타임라인 격자(`DailyDetailScreen.tsx`의 `buildTimelineHours`)는 이 계획에서 건드리지 않는다 — 알림 간격은 알림 발송 시점에만 영향을 준다(`2026-08-19-notification-settings-ui-design.md` 2절).
- 활동 시간대는 자정을 넘기지 않는다(`startHour < endHour`, 0~23 범위) — 기존 검증 규칙을 유지한다.
- 알림 간격의 허용 값은 1, 2, 3뿐이다.
- 새 UI 라이브러리(슬라이더 패키지 등)를 추가하지 않는다 — 이미 설치된 `react-native`(`PanResponder`), `react-native-gesture-handler`, `react-native-reanimated`로 충분하며, 이번 슬라이더는 정수 시간 단위로만 값이 바뀌므로 `PanResponder` + 순수 함수만으로 구현한다.
- 스타일은 `mobile/src/shared/theme.ts`의 기존 `colors` 토큰만 사용한다. 새 색상 값을 임의로 추가하지 않는다.
- 회고 알림(별도 시각, 온/오프)은 아직 구현되지 않은 기능이므로 이번 계획에 포함하지 않는다.

---

## File Structure

```
mobile/src/features/notifications/
  formatHour.ts                    # 신규: "HH:00" 포맷 헬퍼 (슬라이더·화면 공용)
  activityWindowGeometry.ts        # 신규: 슬라이더 좌표<->시각 변환, 드래그 클램프 순수 함수
  activityWindowPresets.ts         # 신규: 프리셋 목록 + 현재 구간과 프리셋 매칭
  ActivityWindowSlider.tsx         # 신규: 듀얼 핸들 레인지 슬라이더 컴포넌트
  notificationSchedule.ts          # 수정: intervalHours 반영 + 하루 알림 횟수 계산 함수 추가
  ExpoNotificationScheduler.ts     # 수정: reschedule()가 intervalHours를 받아 반영
  NotificationSettingsScreen.tsx   # 수정: 프리셋+슬라이더+간격 선택, 즉시 적용 모델로 재작성

mobile/src/features/settings/
  AppSettingsRepository.ts         # 수정: NotificationSettings에 intervalHours 필드 추가

mobile/__tests__/
  formatHour.test.ts                       # 신규
  activityWindowGeometry.test.ts           # 신규
  activityWindowPresets.test.ts            # 신규
  ActivityWindowSlider.test.tsx            # 신규
  AppSettingsRepository.test.ts            # 수정
  notificationSchedule.test.ts             # 수정
  ExpoNotificationScheduler.test.ts        # 수정
  NotificationSettingsScreen.test.tsx      # 수정(전면 재작성)
```

---

### Task 1: `AppSettingsRepository`에 `intervalHours` 추가

**Files:**
- Modify: `mobile/src/features/settings/AppSettingsRepository.ts`
- Test: `mobile/__tests__/AppSettingsRepository.test.ts`

**Interfaces:**
- Produces: `NotificationSettings.intervalHours: number` (1 | 2 | 3), `DEFAULT_NOTIFICATION_SETTINGS.intervalHours === 1`

- [ ] **Step 1: 실패하는 테스트 작성**

`mobile/__tests__/AppSettingsRepository.test.ts`를 다음 내용으로 전체 교체한다.

```ts
import { AppSettingsRepository, DEFAULT_NOTIFICATION_SETTINGS } from '../src/features/settings/AppSettingsRepository';

function createDatabase(storedValue?: string) {
  return {
    getFirstAsync: jest.fn(async () => storedValue === undefined ? null : { value: storedValue }),
    runAsync: jest.fn(async () => ({ changes: 1, lastInsertRowId: 0 })),
  };
}

describe('AppSettingsRepository', () => {
  it.each([
    undefined,
    'not-json',
    JSON.stringify({ enabled: true, startHour: 23, endHour: 7, intervalHours: 1, scheduledIds: [] }),
    JSON.stringify({ enabled: true, startHour: 7, endHour: 23, intervalHours: 1, scheduledIds: [42] }),
    JSON.stringify({ enabled: true, startHour: 7, endHour: 23, intervalHours: 4, scheduledIds: [] }),
    JSON.stringify({ enabled: true, startHour: 7, endHour: 23, intervalHours: 0, scheduledIds: [] }),
  ])('returns defaults when stored notification settings are missing or invalid', async (storedValue) => {
    const repository = new AppSettingsRepository(createDatabase(storedValue) as never);

    await expect(repository.getNotificationSettings()).resolves.toEqual(DEFAULT_NOTIFICATION_SETTINGS);
  });

  it('defaults intervalHours to 1 for settings stored before the field existed', async () => {
    const legacyValue = JSON.stringify({ enabled: true, startHour: 7, endHour: 23, scheduledIds: ['footlog-1'] });
    const repository = new AppSettingsRepository(createDatabase(legacyValue) as never);

    await expect(repository.getNotificationSettings()).resolves.toEqual({
      enabled: true,
      startHour: 7,
      endHour: 23,
      intervalHours: 1,
      scheduledIds: ['footlog-1'],
    });
  });

  it('round-trips validated notification settings under the app settings key', async () => {
    const database = createDatabase();
    const repository = new AppSettingsRepository(database as never);
    const settings = { enabled: true, startHour: 8, endHour: 21, intervalHours: 2, scheduledIds: ['footlog-1'] };

    await repository.setNotificationSettings(settings);

    expect(database.runAsync).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO app_settings'),
      'hourly_notification_settings',
      JSON.stringify(settings),
      expect.any(String),
    );
  });

  it('rejects writing an out-of-range interval', async () => {
    const repository = new AppSettingsRepository(createDatabase() as never);

    await expect(repository.setNotificationSettings({
      enabled: true, startHour: 8, endHour: 21, intervalHours: 5, scheduledIds: [],
    })).rejects.toThrow('Invalid notification settings');
  });
});
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

```bash
cd mobile
nvm use 24
npm test -- AppSettingsRepository
```
예상: `intervalHours`가 타입에 없어 컴파일 단계(babel 트랜스파일 자체는 통과)에서는 실행되지만, "defaults intervalHours to 1", "rejects writing an out-of-range interval" 두 테스트가 로직 부재로 FAIL.

- [ ] **Step 3: 최소 구현**

`mobile/src/features/settings/AppSettingsRepository.ts` 전체를 다음으로 교체한다.

```ts
import type { SQLiteDatabase } from 'expo-sqlite';

export const HOURLY_NOTIFICATION_SETTINGS_KEY = 'hourly_notification_settings';

export type NotificationSettings = {
  enabled: boolean;
  startHour: number;
  endHour: number;
  intervalHours: number;
  scheduledIds: string[];
};

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  enabled: false,
  startHour: 7,
  endHour: 23,
  intervalHours: 1,
  scheduledIds: [],
};

export interface NotificationSettingsRepository {
  getNotificationSettings(): Promise<NotificationSettings>;
  setNotificationSettings(settings: NotificationSettings): Promise<void>;
}

function isValidHour(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 23;
}

function isValidIntervalHours(value: unknown): value is number {
  return value === 1 || value === 2 || value === 3;
}

function decodeNotificationSettings(value: string): NotificationSettings | null {
  try {
    const decoded: unknown = JSON.parse(value);
    if (!decoded || typeof decoded !== 'object') return null;

    const candidate = decoded as Record<string, unknown>;
    const intervalHours = candidate.intervalHours === undefined ? 1 : candidate.intervalHours;

    if (
      typeof candidate.enabled !== 'boolean'
      || !isValidHour(candidate.startHour)
      || !isValidHour(candidate.endHour)
      || candidate.startHour >= candidate.endHour
      || !isValidIntervalHours(intervalHours)
      || !Array.isArray(candidate.scheduledIds)
      || !candidate.scheduledIds.every((id) => typeof id === 'string')
    ) {
      return null;
    }

    return {
      enabled: candidate.enabled,
      startHour: candidate.startHour,
      endHour: candidate.endHour,
      intervalHours,
      scheduledIds: [...candidate.scheduledIds],
    };
  } catch {
    return null;
  }
}

function defaultNotificationSettings(): NotificationSettings {
  return { ...DEFAULT_NOTIFICATION_SETTINGS, scheduledIds: [] };
}

export class AppSettingsRepository implements NotificationSettingsRepository {
  constructor(private readonly database: SQLiteDatabase) {}

  async getNotificationSettings(): Promise<NotificationSettings> {
    const row = await this.database.getFirstAsync<{ value: string }>(
      'SELECT value FROM app_settings WHERE key = ?',
      HOURLY_NOTIFICATION_SETTINGS_KEY,
    );

    return row ? decodeNotificationSettings(row.value) ?? defaultNotificationSettings() : defaultNotificationSettings();
  }

  async setNotificationSettings(settings: NotificationSettings): Promise<void> {
    const validated = decodeNotificationSettings(JSON.stringify(settings));
    if (!validated) throw new TypeError('Invalid notification settings');

    await this.database.runAsync(
      `INSERT INTO app_settings (key, value, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      HOURLY_NOTIFICATION_SETTINGS_KEY,
      JSON.stringify(validated),
      new Date().toISOString(),
    );
  }
}
```

- [ ] **Step 4: 테스트 실행 → 통과 확인**

```bash
cd mobile
nvm use 24
npm test -- AppSettingsRepository
```
예상: 전체 PASS

- [ ] **Step 5: 타입체크**

```bash
cd mobile
nvm use 24
npm run typecheck
```
예상: 이 시점에는 `AppSettingsRepository.ts`만 바뀌었으므로 통과. (다른 파일이 `NotificationSettings`를 참조하는 곳은 Task 3, 8에서 함께 고친다 — 지금은 `ExpoNotificationScheduler.test.ts`, `NotificationSettingsScreen.test.tsx`의 목(mock) 객체들이 `intervalHours` 누락으로 에러가 날 수 있다. 에러가 나면 실패로 기록만 하고 다음 태스크에서 고친다는 점을 남기고 넘어간다.)

- [ ] **Step 6: 커밋**

```bash
cd mobile
git add src/features/settings/AppSettingsRepository.ts __tests__/AppSettingsRepository.test.ts
git commit -m "feat(settings): 알림 간격(intervalHours) 필드 추가"
```

---

### Task 2: 알림 스케줄 계산에 간격 반영 + 하루 알림 횟수 함수

**Files:**
- Modify: `mobile/src/features/notifications/notificationSchedule.ts`
- Test: `mobile/__tests__/notificationSchedule.test.ts`

**Interfaces:**
- Consumes: `ActivityWindow`(기존)
- Produces: `buildHourlyCheckInTimes({ now, window, intervalHours, days }): Date[]`, `countScheduledNotificationsPerDay(window: ActivityWindow, intervalHours: number): number`

- [ ] **Step 1: 실패하는 테스트 작성**

`mobile/__tests__/notificationSchedule.test.ts`를 다음으로 전체 교체한다.

```ts
import { TZDate } from '@date-fns/tz';

import { buildHourlyCheckInTimes, countScheduledNotificationsPerDay } from '../src/features/notifications/notificationSchedule';

describe('buildHourlyCheckInTimes', () => {
  it('returns every remaining whole activity hour across the requested local calendar days', () => {
    const times = buildHourlyCheckInTimes({
      now: new Date('2026-08-06T08:32:00+09:00'),
      window: { startHour: 7, endHour: 23 },
      intervalHours: 1,
      days: 2,
    });

    expect(times.map((time) => `${time.getDate()} ${time.getHours()}:00`)).toEqual([
      ...Array.from({ length: 15 }, (_, index) => `6 ${index + 9}:00`),
      ...Array.from({ length: 17 }, (_, index) => `7 ${index + 7}:00`),
    ]);
    expect(times.every((time) => time.getTime() >= new Date('2026-08-06T08:32:00+09:00').getTime())).toBe(true);
  });

  it('includes the current hour when now is exactly on the hour', () => {
    const now = new Date('2026-08-06T09:00:00+09:00');

    const times = buildHourlyCheckInTimes({
      now,
      window: { startHour: 7, endHour: 10 },
      intervalHours: 1,
      days: 1,
    });

    expect(times.map((time) => time.toISOString())).toEqual([
      '2026-08-06T00:00:00.000Z',
      '2026-08-06T01:00:00.000Z',
    ]);
  });

  it('steps by the requested interval and drops a trailing hour that does not land on it', () => {
    const now = new Date('2026-08-06T00:00:00+09:00');

    const times = buildHourlyCheckInTimes({
      now,
      window: { startHour: 7, endHour: 22 },
      intervalHours: 2,
      days: 1,
    });

    expect(times.map((time) => time.getHours())).toEqual([7, 9, 11, 13, 15, 17, 19, 21]);
  });

  it('builds the next day from calendar components when the timezone offset changes', () => {
    const now = new TZDate(2026, 2, 7, 6, 30, 'America/New_York');

    const times = buildHourlyCheckInTimes({
      now,
      window: { startHour: 7, endHour: 8 },
      intervalHours: 1,
      days: 2,
    });

    expect(times.map((time) => new Date(time.getTime()).toISOString())).toEqual([
      '2026-03-07T12:00:00.000Z',
      '2026-03-07T13:00:00.000Z',
      '2026-03-08T11:00:00.000Z',
      '2026-03-08T12:00:00.000Z',
    ]);
    expect(times[2].getTime() - times[0].getTime()).toBe(23 * 60 * 60 * 1000);
  });

  it.each([
    { startHour: 23, endHour: 7 },
    { startHour: 7, endHour: 7 },
  ])('rejects an unsupported activity window $startHour-$endHour', (window) => {
    expect(() => buildHourlyCheckInTimes({ now: new Date(), window, intervalHours: 1, days: 2 })).toThrow(
      'startHour must be earlier than endHour',
    );
  });

  it.each([0, 4, 1.5])('rejects an unsupported interval %s', (intervalHours) => {
    expect(() => buildHourlyCheckInTimes({
      now: new Date(), window: { startHour: 7, endHour: 23 }, intervalHours, days: 2,
    })).toThrow('intervalHours must be 1, 2, or 3');
  });
});

describe('countScheduledNotificationsPerDay', () => {
  it.each([
    { window: { startHour: 7, endHour: 23 }, intervalHours: 1, expected: 17 },
    { window: { startHour: 7, endHour: 22 }, intervalHours: 2, expected: 8 },
    { window: { startHour: 7, endHour: 23 }, intervalHours: 3, expected: 6 },
  ])('counts $expected notifications for $window with $intervalHours-hour interval', ({ window, intervalHours, expected }) => {
    expect(countScheduledNotificationsPerDay(window, intervalHours)).toBe(expected);
  });
});
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

```bash
cd mobile
nvm use 24
npm test -- notificationSchedule
```
예상: `countScheduledNotificationsPerDay`가 존재하지 않아 import 단계에서 실패, interval 관련 케이스도 FAIL.

- [ ] **Step 3: 구현**

`mobile/src/features/notifications/notificationSchedule.ts`를 다음으로 전체 교체한다.

```ts
export type ActivityWindow = {
  startHour: number;
  endHour: number;
};

type BuildHourlyCheckInTimesOptions = {
  now: Date;
  window: ActivityWindow;
  intervalHours: number;
  days: number;
};

const constructDateFrom = Symbol.for('constructDateFrom');

type ConstructableDate = Date & {
  [constructDateFrom]?: (value: Date | number | string) => Date;
};

function cloneDate(date: Date): Date {
  const construct = (date as ConstructableDate)[constructDateFrom];
  return construct ? construct.call(date, date.getTime()) : new Date(date.getTime());
}

function assertValidWindow(window: ActivityWindow): void {
  if (
    !Number.isInteger(window.startHour)
    || !Number.isInteger(window.endHour)
    || window.startHour < 0
    || window.endHour > 23
    || window.startHour >= window.endHour
  ) {
    throw new RangeError('startHour must be earlier than endHour');
  }
}

function assertValidInterval(intervalHours: number): void {
  if (intervalHours !== 1 && intervalHours !== 2 && intervalHours !== 3) {
    throw new RangeError('intervalHours must be 1, 2, or 3');
  }
}

export function buildHourlyCheckInTimes({
  now,
  window,
  intervalHours,
  days,
}: BuildHourlyCheckInTimesOptions): Date[] {
  assertValidWindow(window);
  assertValidInterval(intervalHours);

  if (!Number.isInteger(days) || days < 1) {
    throw new RangeError('days must be a positive integer');
  }

  const times: Date[] = [];

  for (let dayOffset = 0; dayOffset < days; dayOffset += 1) {
    for (let hour = window.startHour; hour <= window.endHour; hour += intervalHours) {
      const candidate = cloneDate(now);
      candidate.setDate(now.getDate() + dayOffset);
      candidate.setHours(hour, 0, 0, 0);

      // A daylight-saving transition can make a local clock hour nonexistent.
      if (candidate.getHours() === hour && candidate.getTime() >= now.getTime()) {
        times.push(candidate);
      }
    }
  }

  return times.sort((left, right) => left.getTime() - right.getTime());
}

export function countScheduledNotificationsPerDay(window: ActivityWindow, intervalHours: number): number {
  assertValidWindow(window);
  assertValidInterval(intervalHours);

  return Math.floor((window.endHour - window.startHour) / intervalHours) + 1;
}
```

- [ ] **Step 4: 테스트 실행 → 통과 확인**

```bash
cd mobile
nvm use 24
npm test -- notificationSchedule
```
예상: 전체 PASS

- [ ] **Step 5: 커밋**

```bash
cd mobile
git add src/features/notifications/notificationSchedule.ts __tests__/notificationSchedule.test.ts
git commit -m "feat(notifications): 알림 간격 반영한 스케줄 계산과 하루 알림 횟수 함수 추가"
```

---

### Task 3: `ExpoNotificationScheduler`가 알림 간격을 받아 반영

**Files:**
- Modify: `mobile/src/features/notifications/ExpoNotificationScheduler.ts`
- Test: `mobile/__tests__/ExpoNotificationScheduler.test.ts`

**Interfaces:**
- Consumes: `buildHourlyCheckInTimes`(Task 2), `NotificationSettings`(Task 1, `intervalHours` 포함)
- Produces: `NotificationScheduler.reschedule(window: ActivityWindow, intervalHours: number): Promise<NotificationScheduleResult>` — `disable()`/`refreshIfEnabled()` 시그니처는 변경하지 않음(내부적으로 저장된 `intervalHours`를 그대로 사용)

- [ ] **Step 1: 실패하는 테스트 작성**

`mobile/__tests__/ExpoNotificationScheduler.test.ts`를 다음으로 전체 교체한다(모든 `createRepository` 호출에 `intervalHours` 추가, 모든 `.reschedule(...)` 호출에 두 번째 인자 추가, 관련 `setNotificationSettings` 기대값에 `intervalHours` 추가, 간격 반영을 검증하는 신규 테스트 2개 추가).

```ts
import { Platform } from 'react-native';

import { ExpoNotificationScheduler } from '../src/features/notifications/ExpoNotificationScheduler';
import type { NotificationSettingsRepository } from '../src/features/settings/AppSettingsRepository';

const mockGetPermissionsAsync = jest.fn();
const mockRequestPermissionsAsync = jest.fn();
const mockCancelScheduledNotificationAsync = jest.fn();
const mockScheduleNotificationAsync = jest.fn();
const mockSetNotificationChannelAsync = jest.fn();

jest.mock('expo-notifications', () => ({
  AndroidImportance: { DEFAULT: 3 },
  SchedulableTriggerInputTypes: { DATE: 'date' },
  getPermissionsAsync: (...args: unknown[]) => mockGetPermissionsAsync(...args),
  requestPermissionsAsync: (...args: unknown[]) => mockRequestPermissionsAsync(...args),
  cancelScheduledNotificationAsync: (...args: unknown[]) => mockCancelScheduledNotificationAsync(...args),
  scheduleNotificationAsync: (...args: unknown[]) => mockScheduleNotificationAsync(...args),
  setNotificationChannelAsync: (...args: unknown[]) => mockSetNotificationChannelAsync(...args),
}));

function createRepository(initial: {
  enabled: boolean;
  startHour: number;
  endHour: number;
  intervalHours: number;
  scheduledIds: string[];
}): NotificationSettingsRepository & { setNotificationSettings: jest.Mock } {
  return {
    getNotificationSettings: jest.fn(async () => initial),
    setNotificationSettings: jest.fn(async () => undefined),
  };
}

describe('ExpoNotificationScheduler', () => {
  beforeEach(() => {
    mockGetPermissionsAsync.mockReset();
    mockRequestPermissionsAsync.mockReset();
    mockCancelScheduledNotificationAsync.mockReset();
    mockScheduleNotificationAsync.mockReset();
    mockSetNotificationChannelAsync.mockReset();
    mockGetPermissionsAsync.mockResolvedValue({ status: 'granted', granted: true, canAskAgain: true, expires: 'never' });
    mockRequestPermissionsAsync.mockResolvedValue({ status: 'granted', granted: true, canAskAgain: true, expires: 'never' });
    mockCancelScheduledNotificationAsync.mockResolvedValue(undefined);
    mockScheduleNotificationAsync
      .mockResolvedValueOnce('new-1')
      .mockResolvedValueOnce('new-2')
      .mockResolvedValueOnce('new-3')
      .mockResolvedValueOnce('new-4');
    mockSetNotificationChannelAsync.mockResolvedValue(null);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('requests permission when enabling and schedules check-in notifications with the FootLog route', async () => {
    const repository = createRepository({ enabled: false, startHour: 7, endHour: 23, intervalHours: 1, scheduledIds: [] });
    const scheduler = new ExpoNotificationScheduler(repository, () => new Date('2026-08-06T08:32:00+09:00'));

    const result = await scheduler.reschedule({ startHour: 9, endHour: 10 }, 1);

    expect(mockRequestPermissionsAsync).toHaveBeenCalledTimes(1);
    expect(mockScheduleNotificationAsync).toHaveBeenCalledTimes(4);
    expect(mockScheduleNotificationAsync).toHaveBeenNthCalledWith(1, {
      content: {
        title: '체크인할 시간이에요',
        body: '지금 있는 곳에 발자국을 남겨 보세요.',
        data: { url: '/check-in', kind: 'hourly-check-in' },
      },
      trigger: {
        type: 'date',
        date: new Date('2026-08-06T09:00:00+09:00'),
        channelId: 'hourly-check-ins',
      },
    });
    expect(result).toEqual({
      status: 'scheduled',
      scheduledIds: ['new-1', 'new-2', 'new-3', 'new-4'],
    });
  });

  it('cancels only stored FootLog identifiers before rebuilding without asking permission again', async () => {
    const repository = createRepository({
      enabled: true,
      startHour: 7,
      endHour: 23,
      intervalHours: 1,
      scheduledIds: ['footlog-old-1', 'footlog-old-2'],
    });
    const scheduler = new ExpoNotificationScheduler(repository, () => new Date('2026-08-06T08:32:00+09:00'));

    await scheduler.reschedule({ startHour: 9, endHour: 10 }, 1);

    expect(mockGetPermissionsAsync).toHaveBeenCalledTimes(1);
    expect(mockRequestPermissionsAsync).not.toHaveBeenCalled();
    expect(mockCancelScheduledNotificationAsync.mock.calls).toEqual([
      ['footlog-old-1'],
      ['footlog-old-2'],
    ]);
    expect(repository.setNotificationSettings).toHaveBeenLastCalledWith({
      enabled: true,
      startHour: 9,
      endHour: 10,
      intervalHours: 1,
      scheduledIds: ['new-1', 'new-2', 'new-3', 'new-4'],
    });
  });

  it('persists a newly chosen interval when rescheduling', async () => {
    mockScheduleNotificationAsync
      .mockReset()
      .mockResolvedValueOnce('new-1')
      .mockResolvedValueOnce('new-2');
    const repository = createRepository({
      enabled: true, startHour: 7, endHour: 22, intervalHours: 1, scheduledIds: ['old-id'],
    });
    const scheduler = new ExpoNotificationScheduler(repository, () => new Date('2026-08-06T06:00:00+09:00'));

    await scheduler.reschedule({ startHour: 7, endHour: 9 }, 2);

    expect(mockScheduleNotificationAsync).toHaveBeenCalledTimes(2);
    expect(repository.setNotificationSettings).toHaveBeenLastCalledWith({
      enabled: true,
      startHour: 7,
      endHour: 9,
      intervalHours: 2,
      scheduledIds: ['new-1', 'new-2'],
    });
  });

  it('refreshes an enabled two-day schedule using the stored interval without asking for permission again', async () => {
    const repository = createRepository({
      enabled: true,
      startHour: 9,
      endHour: 10,
      intervalHours: 1,
      scheduledIds: ['expiring-footlog-id'],
    });
    const scheduler = new ExpoNotificationScheduler(repository, () => new Date('2026-08-08T08:32:00+09:00'));

    await scheduler.refreshIfEnabled();

    expect(mockRequestPermissionsAsync).not.toHaveBeenCalled();
    expect(mockCancelScheduledNotificationAsync).toHaveBeenCalledWith('expiring-footlog-id');
    expect(mockScheduleNotificationAsync).toHaveBeenCalledTimes(4);
    expect(repository.setNotificationSettings).toHaveBeenLastCalledWith({
      enabled: true,
      startHour: 9,
      endHour: 10,
      intervalHours: 1,
      scheduledIds: ['new-1', 'new-2', 'new-3', 'new-4'],
    });
  });

  it('does not refresh when reminders are disabled', async () => {
    const repository = createRepository({
      enabled: false,
      startHour: 7,
      endHour: 23,
      intervalHours: 1,
      scheduledIds: [],
    });
    const scheduler = new ExpoNotificationScheduler(repository);

    await scheduler.refreshIfEnabled();

    expect(mockGetPermissionsAsync).not.toHaveBeenCalled();
    expect(mockScheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it('recovers from permission revoked after enabling without requesting again', async () => {
    mockGetPermissionsAsync.mockResolvedValue({
      status: 'denied', granted: false, canAskAgain: true, expires: 'never',
    });
    const repository = createRepository({
      enabled: true,
      startHour: 7,
      endHour: 23,
      intervalHours: 1,
      scheduledIds: ['footlog-old'],
    });
    const scheduler = new ExpoNotificationScheduler(repository, () => new Date('2026-08-06T08:32:00+09:00'));

    await expect(scheduler.reschedule({ startHour: 9, endHour: 10 }, 1)).resolves.toEqual({ status: 'denied' });

    expect(mockRequestPermissionsAsync).not.toHaveBeenCalled();
    expect(mockCancelScheduledNotificationAsync).toHaveBeenCalledWith('footlog-old');
    expect(mockScheduleNotificationAsync).not.toHaveBeenCalled();
    expect(repository.setNotificationSettings).toHaveBeenCalledWith({
      enabled: false,
      startHour: 9,
      endHour: 10,
      intervalHours: 1,
      scheduledIds: [],
    });
  });

  it('returns denied and leaves reminders disabled without scheduling', async () => {
    mockRequestPermissionsAsync.mockResolvedValue({
      status: 'denied', granted: false, canAskAgain: false, expires: 'never',
    });
    const repository = createRepository({ enabled: false, startHour: 7, endHour: 23, intervalHours: 1, scheduledIds: [] });
    const scheduler = new ExpoNotificationScheduler(repository, () => new Date('2026-08-06T08:32:00+09:00'));

    await expect(scheduler.reschedule({ startHour: 9, endHour: 10 }, 1)).resolves.toEqual({ status: 'denied' });

    expect(mockScheduleNotificationAsync).not.toHaveBeenCalled();
    expect(repository.setNotificationSettings).toHaveBeenLastCalledWith({
      enabled: false,
      startHour: 9,
      endHour: 10,
      intervalHours: 1,
      scheduledIds: [],
    });
  });

  it('uses the hourly-check-ins Android channel', async () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    const repository = createRepository({ enabled: false, startHour: 7, endHour: 23, intervalHours: 1, scheduledIds: [] });
    const scheduler = new ExpoNotificationScheduler(repository, () => new Date('2026-08-06T08:32:00+09:00'));

    await scheduler.reschedule({ startHour: 9, endHour: 10 }, 1);

    expect(mockSetNotificationChannelAsync).toHaveBeenCalledWith('hourly-check-ins', {
      name: '시간별 체크인',
      importance: 3,
    });
  });

  it('disables reminders by canceling only stored identifiers and preserves the stored interval', async () => {
    const repository = createRepository({
      enabled: true,
      startHour: 8,
      endHour: 21,
      intervalHours: 3,
      scheduledIds: ['footlog-1', 'footlog-2'],
    });
    const scheduler = new ExpoNotificationScheduler(repository);

    await scheduler.disable({ startHour: 8, endHour: 21 });

    expect(mockCancelScheduledNotificationAsync.mock.calls).toEqual([
      ['footlog-1'],
      ['footlog-2'],
    ]);
    expect(repository.setNotificationSettings).toHaveBeenCalledWith({
      enabled: false,
      startHour: 8,
      endHour: 21,
      intervalHours: 3,
      scheduledIds: [],
    });
    expect(mockRequestPermissionsAsync).not.toHaveBeenCalled();
  });

  it('cancels every newly-created notification when settings persistence fails', async () => {
    const persistenceError = new Error('settings persistence failed');
    const repository = createRepository({
      enabled: false,
      startHour: 7,
      endHour: 23,
      intervalHours: 1,
      scheduledIds: [],
    });
    repository.setNotificationSettings
      .mockRejectedValueOnce(persistenceError)
      .mockResolvedValueOnce(undefined);
    const scheduler = new ExpoNotificationScheduler(repository, () => new Date('2026-08-06T08:32:00+09:00'));

    await expect(scheduler.reschedule({ startHour: 9, endHour: 10 }, 1)).rejects.toBe(persistenceError);

    expect(mockCancelScheduledNotificationAsync.mock.calls).toEqual([
      ['new-1'],
      ['new-2'],
      ['new-3'],
      ['new-4'],
    ]);
  });

  it('best-effort cancels notifications created before a partial scheduling failure', async () => {
    const schedulingError = new Error('schedule failed');
    mockScheduleNotificationAsync
      .mockReset()
      .mockResolvedValueOnce('partial-new-1')
      .mockRejectedValueOnce(schedulingError);
    const repository = createRepository({
      enabled: false,
      startHour: 7,
      endHour: 23,
      intervalHours: 1,
      scheduledIds: [],
    });
    const scheduler = new ExpoNotificationScheduler(repository, () => new Date('2026-08-06T08:32:00+09:00'));

    await expect(scheduler.reschedule({ startHour: 9, endHour: 10 }, 1)).rejects.toBe(schedulingError);

    expect(mockCancelScheduledNotificationAsync).toHaveBeenCalledWith('partial-new-1');
  });

  it('persists a newly-created identifier when rollback cancellation fails', async () => {
    const schedulingError = new Error('schedule failed');
    mockScheduleNotificationAsync
      .mockReset()
      .mockResolvedValueOnce('orphaned-new-id')
      .mockRejectedValueOnce(schedulingError);
    mockCancelScheduledNotificationAsync.mockRejectedValueOnce(new Error('cancel failed'));
    const repository = createRepository({
      enabled: false,
      startHour: 7,
      endHour: 23,
      intervalHours: 1,
      scheduledIds: [],
    });
    const scheduler = new ExpoNotificationScheduler(repository, () => new Date('2026-08-06T08:32:00+09:00'));

    await expect(scheduler.reschedule({ startHour: 9, endHour: 10 }, 1)).rejects.toBe(schedulingError);

    expect(repository.setNotificationSettings).toHaveBeenLastCalledWith({
      enabled: false,
      startHour: 9,
      endHour: 10,
      intervalHours: 1,
      scheduledIds: ['orphaned-new-id'],
    });
  });

  it('recovers persisted settings to disabled after rebuilding fails', async () => {
    const schedulingError = new Error('schedule failed');
    mockScheduleNotificationAsync.mockReset().mockRejectedValueOnce(schedulingError);
    const repository = createRepository({
      enabled: true,
      startHour: 7,
      endHour: 23,
      intervalHours: 1,
      scheduledIds: ['old-footlog-id'],
    });
    const scheduler = new ExpoNotificationScheduler(repository, () => new Date('2026-08-06T08:32:00+09:00'));

    await expect(scheduler.reschedule({ startHour: 9, endHour: 10 }, 1)).rejects.toBe(schedulingError);

    expect(repository.setNotificationSettings).toHaveBeenCalledWith({
      enabled: false,
      startHour: 9,
      endHour: 10,
      intervalHours: 1,
      scheduledIds: [],
    });
  });
});
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

```bash
cd mobile
nvm use 24
npm test -- ExpoNotificationScheduler
```
예상: `reschedule`가 두 번째 인자를 받지 않아 `intervalHours`가 저장되지 않으므로 다수 FAIL.

- [ ] **Step 3: 구현**

`mobile/src/features/notifications/ExpoNotificationScheduler.ts`를 다음으로 전체 교체한다.

```ts
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import type { NotificationSettingsRepository } from '../settings/AppSettingsRepository';
import { buildHourlyCheckInTimes, type ActivityWindow } from './notificationSchedule';

const CHANNEL_ID = 'hourly-check-ins';

export type NotificationScheduleResult =
  | { status: 'scheduled'; scheduledIds: string[] }
  | { status: 'denied' };

export interface NotificationScheduler {
  reschedule(window: ActivityWindow, intervalHours: number): Promise<NotificationScheduleResult>;
  disable(window: ActivityWindow): Promise<void>;
  refreshIfEnabled(): Promise<void>;
}

export class ExpoNotificationScheduler implements NotificationScheduler {
  private mutationQueue: Promise<void> = Promise.resolve();

  constructor(
    private readonly settingsRepository: NotificationSettingsRepository,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async reschedule(window: ActivityWindow, intervalHours: number): Promise<NotificationScheduleResult> {
    return this.enqueue(() => this.performReschedule(window, intervalHours));
  }

  async refreshIfEnabled(): Promise<void> {
    return this.enqueue(async () => {
      const current = await this.settingsRepository.getNotificationSettings();
      if (!current.enabled) return;
      await this.performReschedule(
        { startHour: current.startHour, endHour: current.endHour },
        current.intervalHours,
      );
    });
  }

  private async performReschedule(
    window: ActivityWindow,
    intervalHours: number,
  ): Promise<NotificationScheduleResult> {
    const current = await this.settingsRepository.getNotificationSettings();

    const permission = current.enabled
      ? await Notifications.getPermissionsAsync()
      : await Notifications.requestPermissionsAsync();

    if (!permission.granted) {
      await this.cancelIdentifiers(current.scheduledIds);
      await this.settingsRepository.setNotificationSettings({
        enabled: false,
        ...window,
        intervalHours,
        scheduledIds: [],
      });
      return { status: 'denied' };
    }

    await this.cancelIdentifiers(current.scheduledIds);

    const scheduledIds: string[] = [];
    try {
      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
          name: '시간별 체크인',
          importance: Notifications.AndroidImportance.DEFAULT,
        });
      }

      for (const date of buildHourlyCheckInTimes({ now: this.now(), window, intervalHours, days: 2 })) {
        const identifier = await Notifications.scheduleNotificationAsync({
          content: {
            title: '체크인할 시간이에요',
            body: '지금 있는 곳에 발자국을 남겨 보세요.',
            data: { url: '/check-in', kind: 'hourly-check-in' },
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DATE,
            date,
            channelId: CHANNEL_ID,
          },
        });
        scheduledIds.push(identifier);
      }

      await this.settingsRepository.setNotificationSettings({
        enabled: true,
        ...window,
        intervalHours,
        scheduledIds,
      });

      return { status: 'scheduled', scheduledIds };
    } catch (error) {
      const orphanedIds = await this.cancelIdentifiersBestEffort(scheduledIds);
      await this.recoverDisabledSettings(window, intervalHours, orphanedIds);
      throw error;
    }
  }

  async disable(window: ActivityWindow): Promise<void> {
    return this.enqueue(async () => {
      const current = await this.settingsRepository.getNotificationSettings();
      await this.cancelIdentifiers(current.scheduledIds);
      await this.settingsRepository.setNotificationSettings({
        enabled: false,
        ...window,
        intervalHours: current.intervalHours,
        scheduledIds: [],
      });
    });
  }

  private async cancelIdentifiers(identifiers: string[]): Promise<void> {
    for (const identifier of identifiers) {
      await Notifications.cancelScheduledNotificationAsync(identifier);
    }
  }

  private async cancelIdentifiersBestEffort(identifiers: string[]): Promise<string[]> {
    const results = await Promise.allSettled(
      identifiers.map((identifier) => Notifications.cancelScheduledNotificationAsync(identifier)),
    );
    return identifiers.filter((_, index) => results[index].status === 'rejected');
  }

  private async recoverDisabledSettings(
    window: ActivityWindow,
    intervalHours: number,
    orphanedIds: string[],
  ): Promise<void> {
    try {
      await this.settingsRepository.setNotificationSettings({
        enabled: false,
        ...window,
        intervalHours,
        scheduledIds: orphanedIds,
      });
    } catch {
      // Keep the original scheduling/persistence failure for the caller.
    }
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.mutationQueue.then(operation, operation);
    this.mutationQueue = result.then(() => undefined, () => undefined);
    return result;
  }
}
```

- [ ] **Step 4: 테스트 실행 → 통과 확인**

```bash
cd mobile
nvm use 24
npm test -- ExpoNotificationScheduler
```
예상: 전체 PASS

- [ ] **Step 5: 타입체크**

```bash
cd mobile
nvm use 24
npm run typecheck
```
예상: `NotificationSettingsScreen.tsx`가 아직 `reschedule(window)`를 한 개 인자로 호출하고 있어 에러가 남는다 — Task 8에서 해소된다는 점을 기록하고 넘어간다.

- [ ] **Step 6: 커밋**

```bash
cd mobile
git add src/features/notifications/ExpoNotificationScheduler.ts __tests__/ExpoNotificationScheduler.test.ts
git commit -m "feat(notifications): 스케줄러가 알림 간격을 받아 예약·복구에 반영"
```

---

### Task 4: 슬라이더 좌표 변환 순수 함수 (`activityWindowGeometry.ts`)

**Files:**
- Create: `mobile/src/features/notifications/activityWindowGeometry.ts`
- Test: `mobile/__tests__/activityWindowGeometry.test.ts`

**Interfaces:**
- Produces: `hourFromOffset(offsetX: number, trackWidth: number): number`, `offsetFromHour(hour: number, trackWidth: number): number`, `clampStartHour(candidateHour: number, endHour: number): number`, `clampEndHour(candidateHour: number, startHour: number): number`

- [ ] **Step 1: 실패하는 테스트 작성**

`mobile/__tests__/activityWindowGeometry.test.ts`:

```ts
import {
  clampEndHour,
  clampStartHour,
  hourFromOffset,
  offsetFromHour,
} from '../src/features/notifications/activityWindowGeometry';

describe('hourFromOffset', () => {
  it('maps a track offset to the nearest hour across 0-23', () => {
    expect(hourFromOffset(0, 230)).toBe(0);
    expect(hourFromOffset(230, 230)).toBe(23);
    expect(hourFromOffset(115, 230)).toBe(12);
  });

  it('clamps offsets outside the track to the nearest valid hour', () => {
    expect(hourFromOffset(-20, 230)).toBe(0);
    expect(hourFromOffset(300, 230)).toBe(23);
  });

  it('returns 0 when the track has not been measured yet', () => {
    expect(hourFromOffset(50, 0)).toBe(0);
  });
});

describe('offsetFromHour', () => {
  it('is the inverse of hourFromOffset at whole-hour boundaries', () => {
    expect(offsetFromHour(0, 230)).toBe(0);
    expect(offsetFromHour(23, 230)).toBe(230);
    expect(offsetFromHour(12, 230)).toBeCloseTo(120, 0);
  });
});

describe('clampStartHour', () => {
  it('keeps the start hour at least one hour before the end hour', () => {
    expect(clampStartHour(10, 23)).toBe(10);
    expect(clampStartHour(23, 10)).toBe(9);
    expect(clampStartHour(9, 10)).toBe(9);
  });
});

describe('clampEndHour', () => {
  it('keeps the end hour at least one hour after the start hour', () => {
    expect(clampEndHour(15, 7)).toBe(15);
    expect(clampEndHour(3, 7)).toBe(8);
    expect(clampEndHour(8, 7)).toBe(8);
  });
});
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

```bash
cd mobile
nvm use 24
npm test -- activityWindowGeometry
```
예상: 모듈이 없어 FAIL.

- [ ] **Step 3: 구현**

`mobile/src/features/notifications/activityWindowGeometry.ts`:

```ts
const MAX_HOUR = 23;

export function hourFromOffset(offsetX: number, trackWidth: number): number {
  if (trackWidth <= 0) return 0;
  const ratio = Math.min(1, Math.max(0, offsetX / trackWidth));
  return Math.round(ratio * MAX_HOUR);
}

export function offsetFromHour(hour: number, trackWidth: number): number {
  return (hour / MAX_HOUR) * trackWidth;
}

export function clampStartHour(candidateHour: number, endHour: number): number {
  return Math.min(candidateHour, endHour - 1);
}

export function clampEndHour(candidateHour: number, startHour: number): number {
  return Math.max(candidateHour, startHour + 1);
}
```

- [ ] **Step 4: 테스트 실행 → 통과 확인**

```bash
cd mobile
nvm use 24
npm test -- activityWindowGeometry
```
예상: 전체 PASS

- [ ] **Step 5: 커밋**

```bash
cd mobile
git add src/features/notifications/activityWindowGeometry.ts __tests__/activityWindowGeometry.test.ts
git commit -m "feat(notifications): 활동 시간대 슬라이더 좌표 변환 순수 함수 추가"
```

---

### Task 5: 활동 시간대 프리셋 (`activityWindowPresets.ts`)

**Files:**
- Create: `mobile/src/features/notifications/activityWindowPresets.ts`
- Test: `mobile/__tests__/activityWindowPresets.test.ts`

**Interfaces:**
- Produces: `ACTIVITY_WINDOW_PRESETS: ActivityWindowPreset[]`, `matchPreset(startHour: number, endHour: number): string | null`
- 프리셋은 `2026-08-19-notification-settings-ui-design.md` 5절에 정의된 세 가지(출근형 07–22, 자유형 09–23, 아침형 05–20)로 고정한다.

- [ ] **Step 1: 실패하는 테스트 작성**

`mobile/__tests__/activityWindowPresets.test.ts`:

```ts
import { ACTIVITY_WINDOW_PRESETS, matchPreset } from '../src/features/notifications/activityWindowPresets';

describe('ACTIVITY_WINDOW_PRESETS', () => {
  it('only contains same-day windows (no midnight crossing)', () => {
    for (const preset of ACTIVITY_WINDOW_PRESETS) {
      expect(preset.startHour).toBeLessThan(preset.endHour);
    }
  });

  it('exposes the three presets from the design doc', () => {
    expect(ACTIVITY_WINDOW_PRESETS).toEqual([
      { id: 'commute', label: '출근형', startHour: 7, endHour: 22 },
      { id: 'free', label: '자유형', startHour: 9, endHour: 23 },
      { id: 'morning', label: '아침형', startHour: 5, endHour: 20 },
    ]);
  });
});

describe('matchPreset', () => {
  it('returns the preset id when the window matches exactly', () => {
    expect(matchPreset(7, 22)).toBe('commute');
    expect(matchPreset(9, 23)).toBe('free');
  });

  it('returns null when the window does not match any preset', () => {
    expect(matchPreset(8, 22)).toBeNull();
    expect(matchPreset(0, 23)).toBeNull();
  });
});
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

```bash
cd mobile
nvm use 24
npm test -- activityWindowPresets
```
예상: 모듈이 없어 FAIL.

- [ ] **Step 3: 구현**

`mobile/src/features/notifications/activityWindowPresets.ts`:

```ts
export type ActivityWindowPreset = {
  id: string;
  label: string;
  startHour: number;
  endHour: number;
};

export const ACTIVITY_WINDOW_PRESETS: ActivityWindowPreset[] = [
  { id: 'commute', label: '출근형', startHour: 7, endHour: 22 },
  { id: 'free', label: '자유형', startHour: 9, endHour: 23 },
  { id: 'morning', label: '아침형', startHour: 5, endHour: 20 },
];

export function matchPreset(startHour: number, endHour: number): string | null {
  const match = ACTIVITY_WINDOW_PRESETS.find(
    (preset) => preset.startHour === startHour && preset.endHour === endHour,
  );
  return match ? match.id : null;
}
```

- [ ] **Step 4: 테스트 실행 → 통과 확인**

```bash
cd mobile
nvm use 24
npm test -- activityWindowPresets
```
예상: 전체 PASS

- [ ] **Step 5: 커밋**

```bash
cd mobile
git add src/features/notifications/activityWindowPresets.ts __tests__/activityWindowPresets.test.ts
git commit -m "feat(notifications): 활동 시간대 프리셋 목록과 매칭 함수 추가"
```

---

### Task 6: `formatHour` 공용 헬퍼 분리

**Files:**
- Create: `mobile/src/features/notifications/formatHour.ts`
- Test: `mobile/__tests__/formatHour.test.ts`

**Interfaces:**
- Produces: `formatHour(hour: number): string` (예: `7` → `"07:00"`)
- 기존에 `NotificationSettingsScreen.tsx` 안에 있던 로컬 함수를 그대로 옮긴다. `ActivityWindowSlider`(Task 7)와 재작성된 화면(Task 8)이 함께 사용한다.

- [ ] **Step 1: 실패하는 테스트 작성**

`mobile/__tests__/formatHour.test.ts`:

```ts
import { formatHour } from '../src/features/notifications/formatHour';

describe('formatHour', () => {
  it.each([
    [0, '00:00'],
    [7, '07:00'],
    [23, '23:00'],
  ])('formats %i as %s', (hour, expected) => {
    expect(formatHour(hour)).toBe(expected);
  });
});
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

```bash
cd mobile
nvm use 24
npm test -- formatHour
```
예상: 모듈이 없어 FAIL.

- [ ] **Step 3: 구현**

`mobile/src/features/notifications/formatHour.ts`:

```ts
export function formatHour(hour: number): string {
  return `${hour.toString().padStart(2, '0')}:00`;
}
```

- [ ] **Step 4: 테스트 실행 → 통과 확인**

```bash
cd mobile
nvm use 24
npm test -- formatHour
```
예상: 전체 PASS

- [ ] **Step 5: 커밋**

```bash
cd mobile
git add src/features/notifications/formatHour.ts __tests__/formatHour.test.ts
git commit -m "refactor(notifications): 시간 포맷 헬퍼를 공용 모듈로 분리"
```

---

### Task 7: 듀얼 핸들 레인지 슬라이더 컴포넌트 (`ActivityWindowSlider`)

**Files:**
- Create: `mobile/src/features/notifications/ActivityWindowSlider.tsx`
- Test: `mobile/__tests__/ActivityWindowSlider.test.tsx`

**Interfaces:**
- Consumes: `hourFromOffset`, `offsetFromHour`, `clampStartHour`, `clampEndHour`(Task 4), `formatHour`(Task 6)
- Produces: `<ActivityWindowSlider startHour endHour disabled onChangeEnd={(window: { startHour: number; endHour: number }) => void} />`

**범위 참고:** 손가락 드래그(`PanResponder`) 동작 자체는 RNTL로 시뮬레이션하기 어려워 이 테스트에서 다루지 않는다. 대신 스크린리더 증감 액션(`accessibilityAction`)으로 값 변경 경로를 검증한다. 실제 드래그 동작은 Task 9에서 시뮬레이터로 수동 확인한다.

- [ ] **Step 1: 실패하는 테스트 작성**

`mobile/__tests__/ActivityWindowSlider.test.tsx`:

```tsx
import { fireEvent, render } from '@testing-library/react-native';

import { ActivityWindowSlider } from '../src/features/notifications/ActivityWindowSlider';

describe('ActivityWindowSlider', () => {
  it('shows the current window as accessibility values', () => {
    const view = render(
      <ActivityWindowSlider startHour={7} endHour={23} disabled={false} onChangeEnd={jest.fn()} />,
    );

    expect(view.getByLabelText('시작 시간').props.accessibilityValue).toEqual({ text: '07:00' });
    expect(view.getByLabelText('종료 시간').props.accessibilityValue).toEqual({ text: '23:00' });
  });

  it('increments the start hour and reports the new window', () => {
    const onChangeEnd = jest.fn();
    const view = render(
      <ActivityWindowSlider startHour={7} endHour={23} disabled={false} onChangeEnd={onChangeEnd} />,
    );

    fireEvent(view.getByLabelText('시작 시간'), 'accessibilityAction', { nativeEvent: { actionName: 'increment' } });

    expect(onChangeEnd).toHaveBeenCalledWith({ startHour: 8, endHour: 23 });
  });

  it('decrements the end hour and reports the new window', () => {
    const onChangeEnd = jest.fn();
    const view = render(
      <ActivityWindowSlider startHour={7} endHour={23} disabled={false} onChangeEnd={onChangeEnd} />,
    );

    fireEvent(view.getByLabelText('종료 시간'), 'accessibilityAction', { nativeEvent: { actionName: 'decrement' } });

    expect(onChangeEnd).toHaveBeenCalledWith({ startHour: 7, endHour: 22 });
  });

  it('does not let the start hour cross the end hour', () => {
    const onChangeEnd = jest.fn();
    const view = render(
      <ActivityWindowSlider startHour={9} endHour={10} disabled={false} onChangeEnd={onChangeEnd} />,
    );

    fireEvent(view.getByLabelText('시작 시간'), 'accessibilityAction', { nativeEvent: { actionName: 'increment' } });

    expect(onChangeEnd).toHaveBeenCalledWith({ startHour: 9, endHour: 10 });
  });

  it('ignores accessibility actions while disabled', () => {
    const onChangeEnd = jest.fn();
    const view = render(
      <ActivityWindowSlider startHour={7} endHour={23} disabled onChangeEnd={onChangeEnd} />,
    );

    fireEvent(view.getByLabelText('시작 시간'), 'accessibilityAction', { nativeEvent: { actionName: 'increment' } });

    expect(onChangeEnd).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

```bash
cd mobile
nvm use 24
npm test -- ActivityWindowSlider
```
예상: 모듈이 없어 FAIL.

- [ ] **Step 3: 구현**

`mobile/src/features/notifications/ActivityWindowSlider.tsx`:

```tsx
import { useCallback, useRef, useState } from 'react';
import { PanResponder, type PanResponderInstance, StyleSheet, Text, View } from 'react-native';

import { colors } from '../../shared/theme';
import {
  clampEndHour,
  clampStartHour,
  hourFromOffset,
  offsetFromHour,
} from './activityWindowGeometry';
import { formatHour } from './formatHour';

type ActivityWindowSliderProps = {
  startHour: number;
  endHour: number;
  disabled: boolean;
  onChangeEnd: (window: { startHour: number; endHour: number }) => void;
};

type Handle = 'start' | 'end';
type DragState = { handle: Handle; hour: number };

const THUMB_SIZE = 26;

export function ActivityWindowSlider({ startHour, endHour, disabled, onChangeEnd }: ActivityWindowSliderProps) {
  const [trackWidth, setTrackWidth] = useState(0);
  const [drag, setDrag] = useState<DragState | null>(null);

  const startHourRef = useRef(startHour);
  const endHourRef = useRef(endHour);
  const trackWidthRef = useRef(trackWidth);
  const disabledRef = useRef(disabled);
  const dragRef = useRef<DragState | null>(null);

  startHourRef.current = startHour;
  endHourRef.current = endHour;
  trackWidthRef.current = trackWidth;
  disabledRef.current = disabled;

  const emitChange = useCallback((handle: Handle, hour: number) => {
    onChangeEnd(
      handle === 'start'
        ? { startHour: hour, endHour: endHourRef.current }
        : { startHour: startHourRef.current, endHour: hour },
    );
  }, [onChangeEnd]);

  const clampForHandle = (handle: Handle, candidateHour: number): number => (
    handle === 'start'
      ? clampStartHour(candidateHour, endHourRef.current)
      : clampEndHour(candidateHour, startHourRef.current)
  );

  const createResponder = useCallback((handle: Handle): PanResponderInstance => PanResponder.create({
    onStartShouldSetPanResponder: () => !disabledRef.current,
    onMoveShouldSetPanResponder: () => !disabledRef.current,
    onPanResponderGrant: () => {
      const hour = handle === 'start' ? startHourRef.current : endHourRef.current;
      dragRef.current = { handle, hour };
      setDrag({ handle, hour });
    },
    onPanResponderMove: (_event, gesture) => {
      const baseHour = handle === 'start' ? startHourRef.current : endHourRef.current;
      const baseOffset = offsetFromHour(baseHour, trackWidthRef.current);
      const candidateHour = hourFromOffset(baseOffset + gesture.dx, trackWidthRef.current);
      const clampedHour = clampForHandle(handle, candidateHour);
      dragRef.current = { handle, hour: clampedHour };
      setDrag({ handle, hour: clampedHour });
    },
    onPanResponderRelease: () => {
      if (dragRef.current) emitChange(dragRef.current.handle, dragRef.current.hour);
      dragRef.current = null;
      setDrag(null);
    },
    onPanResponderTerminate: () => {
      dragRef.current = null;
      setDrag(null);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [emitChange]);

  const startResponder = useRef(createResponder('start')).current;
  const endResponder = useRef(createResponder('end')).current;

  const liveStartHour = drag?.handle === 'start' ? drag.hour : startHour;
  const liveEndHour = drag?.handle === 'end' ? drag.hour : endHour;

  const onAccessibilityAdjust = (handle: Handle, actionName: string) => {
    if (disabled) return;
    const currentHour = handle === 'start' ? startHour : endHour;
    const delta = actionName === 'increment' ? 1 : -1;
    emitChange(handle, clampForHandle(handle, currentHour + delta));
  };

  return (
    <View style={styles.container}>
      <Text style={styles.label}>활동 시간대</Text>
      <View
        style={styles.track}
        onLayout={(event) => setTrackWidth(event.nativeEvent.layout.width)}
      >
        <View
          style={[
            styles.fill,
            {
              left: offsetFromHour(liveStartHour, trackWidth),
              width: Math.max(0, offsetFromHour(liveEndHour, trackWidth) - offsetFromHour(liveStartHour, trackWidth)),
            },
          ]}
        />
        <View
          {...startResponder.panHandlers}
          accessibilityRole="adjustable"
          accessibilityLabel="시작 시간"
          accessibilityValue={{ text: formatHour(liveStartHour) }}
          accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
          onAccessibilityAction={(event) => onAccessibilityAdjust('start', event.nativeEvent.actionName)}
          style={[styles.thumb, { left: offsetFromHour(liveStartHour, trackWidth) - THUMB_SIZE / 2 }]}
        />
        <View
          {...endResponder.panHandlers}
          accessibilityRole="adjustable"
          accessibilityLabel="종료 시간"
          accessibilityValue={{ text: formatHour(liveEndHour) }}
          accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
          onAccessibilityAction={(event) => onAccessibilityAdjust('end', event.nativeEvent.actionName)}
          style={[styles.thumb, { left: offsetFromHour(liveEndHour, trackWidth) - THUMB_SIZE / 2 }]}
        />
      </View>
      <Text style={styles.rangeLabel}>{formatHour(liveStartHour)} – {formatHour(liveEndHour)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 10 },
  label: { fontSize: 17, fontWeight: '700', color: colors.textPrimary },
  track: { height: 34, borderRadius: 8, backgroundColor: colors.border, justifyContent: 'center' },
  fill: { position: 'absolute', top: 0, bottom: 0, borderRadius: 8, backgroundColor: colors.primary, opacity: 0.85 },
  thumb: {
    position: 'absolute',
    width: THUMB_SIZE,
    height: THUMB_SIZE + 8,
    borderRadius: 9,
    backgroundColor: colors.background,
    borderWidth: 2,
    borderColor: colors.primary,
  },
  rangeLabel: { fontSize: 15, color: colors.textSecondary },
});
```

- [ ] **Step 4: 테스트 실행 → 통과 확인**

```bash
cd mobile
nvm use 24
npm test -- ActivityWindowSlider
```
예상: 전체 PASS

- [ ] **Step 5: 린트**

```bash
cd mobile
nvm use 24
npm run lint
```
예상: PASS. `react-hooks/exhaustive-deps` 경고가 남으면(핸들러 내부에서 참조하는 값을 모두 ref로 읽으므로 의도적으로 의존성 배열을 최소화했다) 위 코드의 `eslint-disable-next-line` 주석 위치가 실제 경고 줄과 일치하는지 확인해 조정한다.

- [ ] **Step 6: 커밋**

```bash
cd mobile
git add src/features/notifications/ActivityWindowSlider.tsx __tests__/ActivityWindowSlider.test.tsx
git commit -m "feat(notifications): 듀얼 핸들 활동 시간대 슬라이더 컴포넌트 추가"
```

---

### Task 8: `NotificationSettingsScreen` 재작성 — 프리셋+슬라이더, 간격 선택, 즉시 적용

**Files:**
- Modify: `mobile/src/features/notifications/NotificationSettingsScreen.tsx`
- Test: `mobile/__tests__/NotificationSettingsScreen.test.tsx`

**Interfaces:**
- Consumes: `ActivityWindowSlider`(Task 7), `ACTIVITY_WINDOW_PRESETS`/`matchPreset`(Task 5), `countScheduledNotificationsPerDay`(Task 2), `formatHour`(Task 6), `NotificationScheduler.reschedule(window, intervalHours)`(Task 3)
- 이 태스크에서 저장 버튼·시간 유효성 에러 문구를 제거하고, 모든 조작이 즉시 반영되도록 전면 재작성한다.

- [ ] **Step 1: 실패하는 테스트 작성**

`mobile/__tests__/NotificationSettingsScreen.test.tsx`를 다음으로 전체 교체한다.

```tsx
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

import { NotificationSettingsScreen } from '../src/features/notifications/NotificationSettingsScreen';
import type { NotificationScheduler } from '../src/features/notifications/ExpoNotificationScheduler';
import type { NotificationSettingsRepository } from '../src/features/settings/AppSettingsRepository';

function createDependencies(options?: { enabled?: boolean; permissionDenied?: boolean }) {
  const settings = {
    enabled: options?.enabled ?? false,
    startHour: 7,
    endHour: 23,
    intervalHours: 1,
    scheduledIds: options?.enabled ? ['stored-footlog-id'] : [],
  };
  const repository: NotificationSettingsRepository & { setNotificationSettings: jest.Mock } = {
    getNotificationSettings: jest.fn(async () => settings),
    setNotificationSettings: jest.fn(async () => undefined),
  };
  const scheduler: NotificationScheduler & { reschedule: jest.Mock; disable: jest.Mock } = {
    reschedule: jest.fn(async () => options?.permissionDenied
      ? { status: 'denied' as const }
      : { status: 'scheduled' as const, scheduledIds: ['new-footlog-id'] }),
    disable: jest.fn(async () => undefined),
    refreshIfEnabled: jest.fn(async () => undefined),
  };

  return { repository, scheduler };
}

describe('NotificationSettingsScreen', () => {
  it('starts disabled with the default window, interval, and daily count', async () => {
    const dependencies = createDependencies();
    const view = await render(<NotificationSettingsScreen {...dependencies} />);

    await waitFor(() => expect(view.getByText('07:00 – 23:00')).toBeTruthy());
    expect(view.getByRole('switch', { name: '시간별 체크인 알림' }).props.value).toBe(false);
    expect(view.getByRole('button', { name: '1시간 간격' }).props.accessibilityState.selected).toBe(true);
    expect(view.getByText('하루 17회 알림')).toBeTruthy();
  });

  it('enables reminders by rescheduling the current window and interval', async () => {
    const dependencies = createDependencies();
    const view = await render(<NotificationSettingsScreen {...dependencies} />);
    const toggle = await view.findByRole('switch', { name: '시간별 체크인 알림' });

    await act(async () => { fireEvent(toggle, 'valueChange', true); });

    expect(dependencies.scheduler.reschedule).toHaveBeenCalledWith({ startHour: 7, endHour: 23 }, 1);
    await waitFor(() => expect(view.getByRole('switch', { name: '시간별 체크인 알림' }).props.value).toBe(true));
  });

  it('returns the switch to off and explains how to recover after permission denial', async () => {
    const dependencies = createDependencies({ permissionDenied: true });
    const view = await render(<NotificationSettingsScreen {...dependencies} />);
    const toggle = await view.findByRole('switch', { name: '시간별 체크인 알림' });

    await act(async () => { fireEvent(toggle, 'valueChange', true); });

    await waitFor(() => expect(view.getByRole('switch', { name: '시간별 체크인 알림' }).props.value).toBe(false));
    expect(view.getByText(/알림 권한이 꺼져 있어요/)).toBeTruthy();
  });

  it('disables reminders through the scheduler so only its stored identifiers are canceled', async () => {
    const dependencies = createDependencies({ enabled: true });
    const view = await render(<NotificationSettingsScreen {...dependencies} />);
    const toggle = await view.findByRole('switch', { name: '시간별 체크인 알림' });

    await act(async () => { fireEvent(toggle, 'valueChange', false); });

    expect(dependencies.scheduler.disable).toHaveBeenCalledWith({ startHour: 7, endHour: 23 });
  });

  it('applies a preset immediately without a separate save step', async () => {
    const dependencies = createDependencies({ enabled: true });
    const view = await render(<NotificationSettingsScreen {...dependencies} />);
    await view.findByText('07:00 – 23:00');

    await act(async () => { fireEvent.press(view.getByRole('button', { name: '아침형' })); });

    expect(dependencies.scheduler.reschedule).toHaveBeenCalledWith({ startHour: 5, endHour: 20 }, 1);
    await waitFor(() => expect(view.getByText('05:00 – 20:00')).toBeTruthy());
    expect(view.getByRole('button', { name: '아침형' }).props.accessibilityState.selected).toBe(true);
  });

  it('applies an interval change immediately and updates the daily count', async () => {
    const dependencies = createDependencies({ enabled: true });
    const view = await render(<NotificationSettingsScreen {...dependencies} />);
    await view.findByText('07:00 – 23:00');

    await act(async () => { fireEvent.press(view.getByRole('button', { name: '2시간 간격' })); });

    expect(dependencies.scheduler.reschedule).toHaveBeenCalledWith({ startHour: 7, endHour: 23 }, 2);
    await waitFor(() => expect(view.getByText('하루 9회 알림')).toBeTruthy());
  });

  it('applies a slider change (via accessibility increment) immediately', async () => {
    const dependencies = createDependencies({ enabled: true });
    const view = await render(<NotificationSettingsScreen {...dependencies} />);
    await view.findByText('07:00 – 23:00');

    await act(async () => {
      fireEvent(view.getByLabelText('시작 시간'), 'accessibilityAction', { nativeEvent: { actionName: 'increment' } });
    });

    expect(dependencies.scheduler.reschedule).toHaveBeenCalledWith({ startHour: 8, endHour: 23 }, 1);
  });

  it('persists a changed window while disabled without scheduling', async () => {
    const dependencies = createDependencies({ enabled: false });
    const view = await render(<NotificationSettingsScreen {...dependencies} />);
    await view.findByText('07:00 – 23:00');

    await act(async () => { fireEvent.press(view.getByRole('button', { name: '자유형' })); });

    expect(dependencies.scheduler.reschedule).not.toHaveBeenCalled();
    await waitFor(() => expect(dependencies.repository.setNotificationSettings).toHaveBeenCalledWith({
      enabled: false,
      startHour: 9,
      endHour: 23,
      intervalHours: 1,
      scheduledIds: [],
    }));
  });

  it('syncs the switch and displayed window to recovered settings after rescheduling fails', async () => {
    const initialSettings = {
      enabled: true,
      startHour: 7,
      endHour: 23,
      intervalHours: 1,
      scheduledIds: ['stored-footlog-id'],
    };
    const recoveredSettings = {
      enabled: false,
      startHour: 6,
      endHour: 19,
      intervalHours: 1,
      scheduledIds: [],
    };
    const repository: NotificationSettingsRepository = {
      getNotificationSettings: jest.fn()
        .mockResolvedValueOnce(initialSettings)
        .mockResolvedValueOnce(recoveredSettings),
      setNotificationSettings: jest.fn(async () => undefined),
    };
    const scheduler: NotificationScheduler = {
      reschedule: jest.fn(async () => { throw new Error('schedule failed'); }),
      disable: jest.fn(async () => undefined),
      refreshIfEnabled: jest.fn(async () => undefined),
    };
    const view = await render(
      <NotificationSettingsScreen repository={repository} scheduler={scheduler} />,
    );
    await view.findByText('07:00 – 23:00');

    await act(async () => { fireEvent.press(view.getByRole('button', { name: '아침형' })); });

    // The screen optimistically shows the tapped preset (05:00–20:00) before the
    // reschedule call resolves; asserting the *recovered* 06:00–19:00 here proves
    // the failure path re-fetches from the repository instead of trusting the optimistic value.
    await waitFor(() => expect(
      view.getByRole('switch', { name: '시간별 체크인 알림' }).props.value,
    ).toBe(false));
    expect(view.getByText('06:00 – 19:00')).toBeTruthy();
    expect(view.getByText('알림 설정을 바꾸지 못했어요. 잠시 후 다시 시도해 주세요.')).toBeTruthy();
  });
});
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

```bash
cd mobile
nvm use 24
npm test -- NotificationSettingsScreen
```
예상: 현재 화면에 프리셋 버튼·간격 버튼·"하루 N회 알림" 문구가 없어 대부분 FAIL.

- [ ] **Step 3: 구현**

`mobile/src/features/notifications/NotificationSettingsScreen.tsx`를 다음으로 전체 교체한다.

```tsx
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors } from '../../shared/theme';
import type {
  NotificationSettings,
  NotificationSettingsRepository,
} from '../settings/AppSettingsRepository';
import { ACTIVITY_WINDOW_PRESETS, matchPreset } from './activityWindowPresets';
import { ActivityWindowSlider } from './ActivityWindowSlider';
import { formatHour } from './formatHour';
import { countScheduledNotificationsPerDay } from './notificationSchedule';
import type { NotificationScheduler } from './ExpoNotificationScheduler';

type NotificationSettingsScreenProps = {
  repository: NotificationSettingsRepository;
  scheduler: NotificationScheduler;
};

const INTERVAL_OPTIONS = [1, 2, 3];

type Window = { startHour: number; endHour: number };

export function NotificationSettingsScreen({
  repository,
  scheduler,
}: NotificationSettingsScreenProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [isBusy, setIsBusy] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [startHour, setStartHour] = useState(7);
  const [endHour, setEndHour] = useState(23);
  const [intervalHours, setIntervalHours] = useState(1);
  const [message, setMessage] = useState<string | null>(null);
  const busyRef = useRef(false);

  const applySettings = useCallback((settings: NotificationSettings) => {
    setEnabled(settings.enabled);
    setStartHour(settings.startHour);
    setEndHour(settings.endHour);
    setIntervalHours(settings.intervalHours);
  }, []);

  useEffect(() => {
    let isCurrent = true;
    void repository.getNotificationSettings()
      .then((settings) => {
        if (!isCurrent) return;
        applySettings(settings);
      })
      .catch(() => {
        if (isCurrent) setMessage('알림 설정을 불러오지 못했어요.');
      })
      .finally(() => {
        if (isCurrent) setIsLoading(false);
      });

    return () => { isCurrent = false; };
  }, [applySettings, repository]);

  const syncAfterFailure = async (errorMessage: string) => {
    try {
      applySettings(await repository.getNotificationSettings());
    } catch {
      // Scheduling failed and cleanup is conservative, so do not leave the UI claiming it is on.
      setEnabled(false);
    }
    setMessage(errorMessage);
  };

  const applyChange = async (nextWindow: Window, nextIntervalHours: number) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setIsBusy(true);
    setMessage(null);
    setStartHour(nextWindow.startHour);
    setEndHour(nextWindow.endHour);
    setIntervalHours(nextIntervalHours);

    try {
      if (enabled) {
        const result = await scheduler.reschedule(nextWindow, nextIntervalHours);
        if (result.status === 'denied') {
          setEnabled(false);
          setMessage('알림 권한이 꺼져 있어요. 기기 설정에서 허용한 뒤 다시 시도해 주세요.');
        }
      } else {
        const current = await repository.getNotificationSettings();
        await repository.setNotificationSettings({
          enabled: false,
          ...nextWindow,
          intervalHours: nextIntervalHours,
          scheduledIds: current.scheduledIds,
        });
      }
    } catch {
      await syncAfterFailure('알림 설정을 바꾸지 못했어요. 잠시 후 다시 시도해 주세요.');
    } finally {
      busyRef.current = false;
      setIsBusy(false);
    }
  };

  const setReminderEnabled = async (nextEnabled: boolean) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setIsBusy(true);
    setMessage(null);

    try {
      if (nextEnabled) {
        const result = await scheduler.reschedule({ startHour, endHour }, intervalHours);
        if (result.status === 'denied') {
          setEnabled(false);
          setMessage('알림 권한이 꺼져 있어요. 기기 설정에서 허용한 뒤 다시 시도해 주세요.');
        } else {
          setEnabled(true);
        }
      } else {
        await scheduler.disable({ startHour, endHour });
        setEnabled(false);
      }
    } catch {
      await syncAfterFailure('알림 설정을 바꾸지 못했어요. 잠시 후 다시 시도해 주세요.');
    } finally {
      busyRef.current = false;
      setIsBusy(false);
    }
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.centered}>
        <Text style={styles.body}>알림 설정을 불러오는 중이에요.</Text>
      </SafeAreaView>
    );
  }

  const selectedPresetId = matchPreset(startHour, endHour);
  const dailyCount = countScheduledNotificationsPerDay({ startHour, endHour }, intervalHours);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.heading}>
          <Text style={styles.title}>체크인 알림</Text>
          <Text style={styles.body}>활동 시간 동안 매시 정각에 발자국을 남기도록 알려 드려요.</Text>
        </View>

        <View style={styles.settingRow}>
          <View style={styles.settingCopy}>
            <Text style={styles.settingTitle}>시간별 체크인 알림</Text>
            <Text style={styles.body}>{formatHour(startHour)} – {formatHour(endHour)}</Text>
          </View>
          <Switch
            accessibilityLabel="시간별 체크인 알림"
            disabled={isBusy}
            onValueChange={(value) => { void setReminderEnabled(value); }}
            value={enabled}
          />
        </View>

        <View style={styles.presetRow}>
          {ACTIVITY_WINDOW_PRESETS.map((preset) => {
            const selected = selectedPresetId === preset.id;
            return (
              <Pressable
                key={preset.id}
                accessibilityRole="button"
                accessibilityLabel={preset.label}
                accessibilityState={{ selected, disabled: isBusy }}
                disabled={isBusy}
                onPress={() => { void applyChange({ startHour: preset.startHour, endHour: preset.endHour }, intervalHours); }}
                style={[styles.presetChip, selected && styles.selectedPresetChip]}
              >
                <Text style={[styles.presetChipText, selected && styles.selectedPresetChipText]}>{preset.label}</Text>
              </Pressable>
            );
          })}
        </View>

        <ActivityWindowSlider
          startHour={startHour}
          endHour={endHour}
          disabled={isBusy}
          onChangeEnd={(window) => { void applyChange(window, intervalHours); }}
        />

        <View style={styles.intervalSection}>
          <Text style={styles.settingTitle}>알림 간격</Text>
          <View style={styles.intervalRow}>
            {INTERVAL_OPTIONS.map((hours) => {
              const selected = hours === intervalHours;
              return (
                <Pressable
                  key={hours}
                  accessibilityRole="button"
                  accessibilityLabel={`${hours}시간 간격`}
                  accessibilityState={{ selected, disabled: isBusy }}
                  disabled={isBusy}
                  onPress={() => { void applyChange({ startHour, endHour }, hours); }}
                  style={[styles.intervalOption, selected && styles.selectedIntervalOption]}
                >
                  <Text style={[styles.intervalOptionText, selected && styles.selectedIntervalOptionText]}>{hours}시간</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <Text style={styles.summary}>하루 {dailyCount}회 알림</Text>

        {message && <Text accessibilityRole="alert" style={styles.message}>{message}</Text>}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: colors.background },
  container: { padding: 24, gap: 24 },
  heading: { gap: 8 },
  title: { fontSize: 30, fontWeight: '700', color: colors.textPrimary },
  body: { fontSize: 16, lineHeight: 24, color: colors.textSecondary },
  settingRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  settingCopy: { flex: 1, gap: 4 },
  settingTitle: { fontSize: 17, fontWeight: '700', color: colors.textPrimary },
  presetRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  presetChip: { borderWidth: 1, borderColor: colors.optionBorder, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8 },
  selectedPresetChip: { backgroundColor: colors.primary, borderColor: colors.primary },
  presetChipText: { color: colors.optionText, fontSize: 14, fontWeight: '600' },
  selectedPresetChipText: { color: colors.onPrimary },
  intervalSection: { gap: 10 },
  intervalRow: { flexDirection: 'row', gap: 8 },
  intervalOption: { flex: 1, alignItems: 'center', borderWidth: 1, borderColor: colors.optionBorder, borderRadius: 10, paddingVertical: 10 },
  selectedIntervalOption: { backgroundColor: colors.primary, borderColor: colors.primary },
  intervalOptionText: { color: colors.optionText, fontSize: 15, fontWeight: '600' },
  selectedIntervalOptionText: { color: colors.onPrimary },
  summary: { fontSize: 14, color: colors.textMuted, textAlign: 'center' },
  message: { color: colors.noticeText, backgroundColor: colors.noticeBackground, borderRadius: 10, padding: 14, fontSize: 15, lineHeight: 22 },
});
```

- [ ] **Step 4: 테스트 실행 → 통과 확인**

```bash
cd mobile
nvm use 24
npm test -- NotificationSettingsScreen
```
예상: 전체 PASS

- [ ] **Step 5: 전체 검사 실행**

```bash
cd mobile
nvm use 24
npm test
npm run typecheck
npm run lint
npx expo-doctor
```
예상: 전체 PASS. (이 시점에 다른 파일에서 남아있던 타입 에러가 있다면 여기서 모두 해소되어야 한다.)

- [ ] **Step 6: 커밋**

```bash
cd mobile
git add src/features/notifications/NotificationSettingsScreen.tsx __tests__/NotificationSettingsScreen.test.tsx
git commit -m "feat(notifications): 알림 설정 화면을 프리셋+슬라이더, 즉시 적용 모델로 재작성"
```

---

### Task 9: 시뮬레이터 수동 QA

**Files:** 없음(코드 변경 없음, 수동 검증만)

- [ ] **Step 1: iOS 시뮬레이터 빌드 실행**

```bash
cd mobile
nvm use 24
npx expo run:ios --no-bundler
```

- [ ] **Step 2: 알림 설정 화면에서 다음을 직접 확인한다**

  - 프리셋 칩(출근형/자유형/아침형) 탭 → 슬라이더가 즉시 해당 구간으로 이동하고 선택 표시가 되는지
  - 슬라이더 양쪽 핸들을 손가락으로 직접 드래그 → 저장 버튼 없이 즉시 반영되고, 시작 핸들이 종료 핸들을 넘어가지 않는지(반대도 동일)
  - 알림 간격 1시간/2시간/3시간 전환 시 "하루 N회 알림" 문구가 즉시 갱신되는지
  - 알림을 켠 상태에서 시스템 설정에서 알림 권한을 끈 뒤 화면을 조작 → 스위치가 꺼지고 안내 문구가 뜨는지
  - VoiceOver를 켜고 슬라이더 핸들에 포커스한 뒤 위/아래로 스와이프 → 시간이 1시간씩 증감하는지

- [ ] **Step 3: 발견된 문제를 기록하고 필요하면 이전 태스크로 돌아가 수정한다**

수정이 필요하면 해당 태스크 파일을 다시 열어 코드를 고치고, `npm test`/`npm run typecheck`/`npm run lint`를 다시 실행한 뒤 같은 커밋 메시지 규칙으로 새 커밋을 추가한다. 기존 커밋을 `--amend`하지 않는다.
