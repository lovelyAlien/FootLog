---
title: Expo Router와 로컬 알림 수명주기 통합 검증
date: 2026-08-09
category: integration-issues
module: FootLog mobile foundation and local notification QA
problem_type: integration_issue
component: tooling
symptoms:
  - "iOS Release 번들이 제품 route 대신 create-expo-app starter 화면을 표시했다."
  - "Simulator 알림을 탭해도 체크인 화면으로 이동하지 않았고 notification response data가 비어 있었다."
  - "2일 범위 로컬 알림이 자동으로 보충되지 않아 활성 설정과 달리 알림이 만료될 수 있었다."
  - "Simulator 결과를 실제 기기 검증으로 오인할 위험이 있었다."
root_cause: config_error
resolution_type: code_fix
severity: high
related_components:
  - development_workflow
  - testing_framework
  - Expo Router
  - Expo Notifications
tags:
  - expo-router
  - expo-notifications
  - ios-simulator
  - apns-payload
  - notification-reconciliation
  - release-build
  - qa-boundary
  - local-first
---

# Expo Router와 로컬 알림 수명주기 통합 검증

## Problem

FootLog의 iOS Release Simulator E2E 검증에서 제품 화면 대신 Expo starter 화면이 번들링되고, 알림을 눌러도 체크인 화면으로 이동하지 않았다. 같은 검증 과정에서 유한한 2일 알림 예약이 갱신되지 않고, 예약 실패 후 취소에도 실패한 알림 ID가 유실될 수 있는 문제도 확인됐다.

## Symptoms

- Release 앱이 FootLog의 오늘 화면 대신 “Welcome to Expo”를 표시했다.
- `simctl push` 알림을 탭해도 `/check-in`으로 이동하지 않았고 임시 진단값의 `content.data`가 `{}`였다.
- cold start 알림 응답이 DB나 root navigation 준비보다 먼저 도착할 수 있었다.
- 활성화된 알림 설정이 남아 있어도 최초 2일 예약 이후 알림이 소진될 수 있었다.
- rollback 취소에 실패한 OS 알림 ID를 잃으면 앱에서 해당 알림을 다시 정리할 수 없었다.

## What Didn't Work

- 단위 테스트와 개발 실행만으로 route root를 `app/`이라고 가정했다. Expo Router는 `src/app/`이 존재하면 이를 우선 선택했다.
- 알림 탭 실패를 처음부터 cold-start 타이밍 문제로 단정했다. 실제로는 Simulator APNs fixture의 custom data 구조도 잘못되어 있었다.
- `url`과 `kind`를 APNs 최상위에 둔 fixture는 Expo iOS에서 `content.data`로 전달되지 않았다.
- Release의 `console.warn`으로 payload를 관찰하려 했지만 유효한 진단 신호를 얻지 못했다. 임시 화면 진단으로 `{}`를 확인한 뒤 native adapter 구현을 추적해야 했다.
- best-effort 취소 뒤 무조건 `scheduledIds: []`를 저장하면 OS에 남은 알림을 다시 찾을 수 없다.

## Solution

### 제품 route root를 하나로 제한

중복 `src/app/` starter route와 전용 starter 구성 요소를 제거했다. Expo가 실제 선택하는 디렉터리를 검사하는 회귀 테스트를 추가했다.

```ts
expect(getRouterDirectory(process.cwd())).toBe('app');
```

### Simulator fixture와 앱 payload를 구분

앱이 예약하는 로컬 알림은 Expo API의 `content.data`를 그대로 사용한다. 반면 `simctl push`로 주입하는 remote fixture는 Expo iOS 변환 규칙에 맞춰 custom data를 `body` 딕셔너리에 넣었다.

```json
{
  "Simulator Target Bundle": "com.footlog.app",
  "aps": {
    "alert": {
      "title": "FootLog 체크인",
      "body": "지금 있는 곳을 발자국으로 남겨보세요."
    },
    "sound": "default"
  },
  "body": {
    "url": "/check-in",
    "kind": "hourly-check-in"
  }
}
```

### 알림 응답과 navigation 준비를 분리

root layout mount 시 listener를 먼저 등록하고 마지막 응답을 조회한다. 유효한 route는 pending state에 보관하고, DB와 Expo Router root navigation이 모두 준비된 뒤 한 번만 이동한다. 이 순서를 component test로 고정했다.

### 유한 예약을 foreground에서 갱신

`refreshIfEnabled()`가 활성 설정을 읽어 다음 두 로컬 날짜를 다시 예약한다. 앱 초기화와 foreground 복귀 때 이를 호출하며, `reschedule`, `disable`, `refreshIfEnabled`는 하나의 Promise queue로 직렬화한다.

### 정리하지 못한 외부 자원 handle 보존

부분 예약 실패 후 취소 결과를 수집하고 취소에 실패한 ID만 disabled 설정에 남긴다. 알림이 꺼진 상태에서 시간 범위만 저장해도 기존 ID를 보존하므로 다음 작업에서 정리를 재시도할 수 있다.

## Why This Works

Release 번들이 사용하는 route 선택 규칙을 테스트가 직접 검사하므로 개발 화면과 제품 번들의 차이를 조기에 찾을 수 있다. 알림 응답 수신, SQLite 초기화, navigation 준비를 별도 상태로 취급하면 cold start 순서가 달라도 응답을 잃거나 너무 일찍 이동하지 않는다.

알림 예약은 유한하므로 최초 예약만으로 지속 동작할 수 없다. 앱 시작과 foreground 복귀를 reconciliation 지점으로 사용해 horizon을 앞으로 옮기고, mutation 직렬화로 사용자 설정 변경과의 경쟁을 막는다. OS 알림 ID는 외부 자원 handle이므로 취소 실패 시 삭제하지 않아야 복구 가능한 불일치로 남는다.

최종 검증에서는 모바일 15 suites·69 tests, TypeScript, lint, Expo Doctor 20/20, iOS Release Simulator build, 체크인 SQLite 재시작 보존, 알림 탭 `/check-in` 이동과 백엔드 test·bootJar가 통과했다.

## Prevention

- Expo Router 프로젝트에서 `app/`과 `src/app/` route tree를 동시에 두지 않는다.
- 개발 실행뿐 아니라 번들된 Release 앱을 최소 한 번 검증한다.
- `simctl push` fixture와 Expo 로컬 알림 `content.data`가 같은 wire format이라고 가정하지 않는다.
- cold-start 테스트에서 응답 수신, DB 준비, navigation 준비를 독립적으로 제어한다.
- 유한 기간 예약에는 명시적인 reconciliation 시점과 mutation 직렬화가 필요하다.
- 정리에 실패한 외부 자원 ID는 다음 정리 시도를 위해 영속화한다.
- Simulator와 실제 기기의 검증 증거를 분리한다. 실제 GPS·권한 프롬프트·예약 시각 알림과 Android 동작은 환경이 준비될 때 후속 검증한다.

## Related Issues

- [Foundation + Local Check-in QA](../../testing/foundation-local-checkin-qa.md)
- [Foundation + Local Check-in 구현 계획](../../superpowers/plans/2026-08-06-foundation-local-checkin.md)
- [Location Check-in Diary 설계](../../superpowers/specs/2026-08-02-location-checkin-diary-design.md)
