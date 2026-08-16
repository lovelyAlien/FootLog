---
title: Cross-user UUID-reuse guard doesn't propagate automatically across sibling repositories
date: 2026-08-16
category: logic-errors
module: backend
problem_type: logic_error
component: database
symptoms:
  - "다른 사용자가 기존 클라이언트 UUID를 재사용해 upsert를 호출하면 ApiException이 아니라 처리되지 않은 DuplicateKeyException(500)이 발생"
  - "태스크 단위 리뷰에서는 통과했지만 전체 브랜치 리뷰에서 4개 리포지토리 중 1개가 같은 가드를 빠뜨린 채로 발견됨"
root_cause: logic_error
resolution_type: code_fix
severity: high
related_components:
  - database
tags: [ownership-check, upsert, duplicate-key, cross-file-consistency, code-review]
---

# Cross-user UUID-reuse guard doesn't propagate automatically across sibling repositories

## Problem

클라이언트가 UUID를 생성해 서버에 upsert하는 API(체크인, 메모, 회고, 사진 첨부)에서, 존재 여부를 사용자 소유권으로 스코핑한 조회(`WHERE id = ? AND user_id = ?`)만으로 "새로 생성"과 "다른 사용자가 이미 쓴 id"를 구분하려 하면, 다른 사용자가 이미 사용한 id를 재사용했을 때 스코핑된 조회가 빈 결과를 반환해 INSERT 분기로 빠지고, 기본 키(PK) 충돌로 처리되지 않은 `DuplicateKeyException`(원시 500)이 발생한다. 이 클래스의 버그가 4개의 유사한 리포지토리 중 3곳에서는 태스크 실행 중 발견·수정됐지만, 나머지 한 곳(`CheckInNoteRepository`)은 전체 브랜치 리뷰에서야 발견됐다.

## Symptoms

- `CheckInRepository.upsert`(Task 4), `DailyReflectionRepository.upsert`(Task 8), `PhotoAttachmentRepository.createUploading`(Task 10)에서 각각 독립적으로 발견·수정됨.
- `CheckInNoteRepository.upsert`는 이 세 가지 수정이 이미 존재하는 상태에서 구현됐음에도 같은 가드를 갖지 못한 채 통과했다 — 개별 태스크 리뷰(스펙 준수 + 코드 품질)는 그 태스크의 diff만 보므로, "다른 파일에 이미 확립된 패턴을 이 파일이 놓쳤다"는 종류의 결함은 태스크 스코프 리뷰의 시야 밖에 있었다.

## What Didn't Work

- 각 태스크 디스패치 프롬프트에 "이전 태스크에서 이런 버그가 발견됐다"는 문맥을 텍스트로 전달하는 것만으로는 완전히 막지 못했다 — Task 12(연쇄 삭제)나 다른 태스크들이 이 패턴을 명시적으로 상기시켰음에도, `CheckInNoteRepository`는 그 문맥이 전달되기 전(Task 6)에 이미 구현되어 있었고, 이후 아무도 기존 코드로 돌아가 대조 점검을 하지 않았다.

## Solution

패턴을 발견한 즉시 형식화한다: id로 무관하게(소유권 필터 없이) 조회한 뒤, 존재하는 소유자가 요청자와 다르면 INSERT를 시도하기 전에 `404 {ENTITY}_NOT_FOUND`를 던진다.

```java
private Optional<UUID> findOwnerUserId(UUID id) {
  // 소유권으로 스코핑하지 않은 조회 — PK 충돌 여부를 미리 판별하기 위함
  List<UUID> rows = jdbcTemplate.query(
      "SELECT ... FROM <table> WHERE id = ?", ..., id);
  return rows.stream().findFirst();
}

// upsert 진입부에서, 소유권 스코핑된 조회보다 먼저:
Optional<UUID> existingOwner = findOwnerUserId(id);
if (existingOwner.isPresent() && !existingOwner.get().equals(userId)) {
  throw new ApiException(HttpStatus.NOT_FOUND, "<ENTITY>_NOT_FOUND", "...");
}
```

그리고 마지막으로, 전체 브랜치 리뷰(최종 리뷰) 단계에서 리뷰어에게 "이 패턴을 가진 파일이 N개 있다 — 전부 확인하라"고 명시적으로 지시해 4번째 인스턴스를 실제로 잡아냈다.

## Why This Works

전체 브랜치 리뷰는 개별 태스크 리뷰와 달리 여러 파일을 동시에 비교할 수 있는 유일한 지점이다. "이 클래스의 리포지토리가 몇 개 있고, 그중 몇 개가 가드를 가졌는가"라는 질문은 한 태스크의 diff만 보는 리뷰어는 답할 수 없다.

## Prevention

- 같은 구조를 가진 리포지토리(N개의 "형제" 파일)에서 버그를 발견해 고치면, 계획 문서나 최종 리뷰 디스패치 프롬프트에 "이 패턴을 가진 파일 목록"을 명시적으로 나열해 리뷰어가 각각을 개별적으로 대조하게 한다 — "비슷한 코드가 있으니 확인하라"는 일반론보다 파일 목록을 주는 편이 누락을 확실히 막는다.
- 클라이언트 생성 UUID로 upsert를 구현하는 모든 리포지토리는 예외 없이 이 가드를 가져야 한다: (1) 소유권 무관 조회로 id 충돌 여부 확인 → (2) 다른 사용자 소유면 404로 거부 → (3) 그 다음에만 소유권 스코핑된 조회로 생성/수정 분기.
- 삭제 전용 경로(예: 이 프로젝트의 `complete()`, `delete()`)는 INSERT 경로가 없으므로 이 가드가 불필요하다 — 소유권 스코핑된 조회 하나로 충분히 안전하다. 가드가 필요한지 여부는 "이 메서드가 새 PK로 INSERT할 수 있는가"로 판별한다.

## Related Issues

- `docs/2026-08-16-sync-domain-schema-api-design.md` 1절에 "소유권 마스킹 코드" 규약으로 문서화됨.
- [A hard UNIQUE constraint on a soft-deletable column breaks delete-then-recreate](../database-issues/hard-unique-constraint-breaks-soft-delete-recreate.md) — 같은 최종 리뷰에서 발견된, 형제 파일 간 패턴 전파 실패의 다른 사례.
