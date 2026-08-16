---
title: A hard UNIQUE constraint on a soft-deletable column breaks delete-then-recreate
date: 2026-08-16
category: database-issues
module: backend
problem_type: database_issue
component: database
symptoms:
  - "메모를 삭제한 뒤 같은 체크인에 새 메모(새 id)를 추가하면 유니크 제약 위반으로 INSERT가 실패해 처리되지 않은 500이 발생"
root_cause: logic_error
resolution_type: migration
severity: high
related_components:
  - database
tags: [soft-delete, unique-constraint, partial-index, postgresql, migration]
---

# A hard UNIQUE constraint on a soft-deletable column breaks delete-then-recreate

## Problem

`check_in_notes.check_in_id`가 하드 `UNIQUE` 제약을 가진 채로 소프트 삭제(`deleted_at` 타임스탬프, 행은 물리적으로 남음)를 쓰고 있었다. 메모를 삭제해도 행은 DB에 그대로 남아 `check_in_id` 값을 계속 점유하므로, 같은 체크인에 새 메모(새 `id`)를 추가하려는 INSERT가 유니크 제약 위반으로 실패했다 — "메모 작성 → 삭제 → 재작성"이라는 핵심 MVP 흐름 자체가 깨졌다.

## Symptoms

- 체크인에 메모를 추가하고 삭제한 뒤, 같은 체크인에 새 메모를 추가하면 `DuplicateKeyException` → 처리되지 않은 500.
- 같은 설계 문서(`docs/2026-08-16-sync-domain-schema-api-design.md`) 안에서 `daily_reflections`와 `photo_attachments`는 이미 이 문제를 피하는 부분 유니크 인덱스 패턴을 쓰고 있었지만, `check_in_notes` 테이블 설계에는 같은 패턴이 적용되지 않은 채 그대로 구현으로 넘어갔다.

## What Didn't Work

- 개별 태스크 리뷰(Task 6 리뷰, 이후 Task 6 재리뷰)는 각각 통과했다 — 리뷰어가 확인한 것은 그 태스크의 diff가 브리프(설계 문서에서 파생된 계획서 코드)와 일치하는지였고, 브리프 자체에 이미 있던 스키마 결함까지는 검증 범위 밖이었다. 4개 테이블 각각의 소프트 삭제·유니크 제약 조합이 서로 일관되는지는 전체 브랜치 리뷰에서야 대조됐다.

## Solution

하드 `UNIQUE` 제약을 부분 유니크 인덱스로 교체한다.

```sql
-- 기존 (문제):
-- check_in_id UUID NOT NULL UNIQUE REFERENCES check_ins(id)

-- 수정:
ALTER TABLE check_in_notes DROP CONSTRAINT check_in_notes_check_in_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS uq_check_in_notes_check_in_id_active
  ON check_in_notes(check_in_id) WHERE deleted_at IS NULL;
```

Postgres가 인라인 컬럼 `UNIQUE`에 붙이는 기본 제약 이름(`<table>_<column>_key`)은 실제 DB에 접속해 확인 후 `DROP CONSTRAINT`에 썼다 — 이름을 추측하지 않았다.

리포지토리 쪽도 함께 고쳤다: 삭제된 행에 대한 쓰기를 명시적으로 거부(`409 CHECK_IN_NOTE_DELETED`)하도록 가드를 추가해, "삭제는 종단 상태이며 재생성은 새 id로만 가능하다"는 의미를 코드로도 강제했다.

## Why This Works

부분 유니크 인덱스(`WHERE deleted_at IS NULL`)는 "동시에 존재할 수 있는 활성 행은 1개"만 강제하고, 소프트 삭제된 행은 그 제약 대상에서 제외한다. 새 `id`로 INSERT하면 기존 삭제된 행과 충돌하지 않고, 활성 행이 있을 때만 진짜 위반으로 막는다. `daily_reflections`(`UNIQUE (user_id, date) WHERE deleted_at IS NULL`)와 `photo_attachments`(`UNIQUE (check_in_id) WHERE status = 'ready' AND deleted_at IS NULL`)가 이미 같은 패턴을 쓰고 있었다.

## Prevention

- 이 프로젝트에서 소프트 삭제(`deleted_at` 컬럼, 물리적 삭제 없음)를 쓰는 테이블에 "동시에 하나만 활성"류의 유니크 제약이 필요하면, 하드 `UNIQUE`가 아니라 **항상** `WHERE deleted_at IS NULL`(또는 해당 테이블의 활성 상태 조건) 부분 유니크 인덱스를 쓴다.
- 설계 문서에 여러 테이블이 같은 소프트 삭제 패턴을 공유한다면, 하나의 테이블에 적용한 규칙(부분 인덱스)이 나머지 모든 테이블에도 일관되게 적용됐는지 설계 문서 작성 시점과 최종 리뷰 시점 양쪽에서 대조 점검한다 — 한 테이블에만 규칙을 적용하고 다른 테이블에는 빠뜨리는 것이 바로 이번에 발생한 결함이다.
- 검증: `CheckInNoteRepositoryTest`에 메모 삭제 후 같은 체크인에 새 메모(새 id)를 추가하는 회귀 테스트를 추가해 통과를 확인했다.

## Related Issues

- `docs/2026-08-16-sync-domain-schema-api-design.md` 2절 `check_in_notes` 테이블 설명이 이 수정 내용으로 갱신됨.
- [Cross-user UUID reuse guard must be repeated per repository](../logic-errors/cross-user-uuid-reuse-guard-must-be-repeated-per-repository.md) — 같은 최종 리뷰에서 발견된, "한 파일에 적용한 수정이 형제 파일들에 자동으로 전파되지 않는다"는 동일 계열의 교훈.
