---
title: "격리 워크트리가 origin/main 기준으로 생성되어 로컬 전용 커밋이 누락됨"
date: 2026-08-19
category: workflow-issues
module: "git worktree 초기화 (EnterWorktree / subagent-driven-development)"
problem_type: workflow_issue
component: development_workflow
severity: high
applies_when:
  - "EnterWorktree 같은 네이티브 도구로 격리된 git worktree를 새로 만들어 다태스크 서브에이전트 구현 계획을 실행하기 직전"
  - "로컬 main이 origin/main보다 커밋이 앞서 있는 상태(푸시하지 않은 로컬 전용 커밋 존재)에서 worktree를 생성할 때"
  - "worktree 진입 직후 baseline npm test/typecheck 통과만으로 코드베이스가 main과 동일하다고 판단하려 할 때"
symptoms:
  - "Task 1 구현 서브에이전트가 태스크 브리핑에 이미 존재해야 한다고 적힌 '../../shared/theme' import를 해석하지 못해 실패함"
  - "서브에이전트가 파일이 없다고 판단하고 전체 색상 팔레트 대신 { primary: '#2e6af0' }만 담은 스텁 theme.ts를 새로 생성해 기존 화면들이 의존하던 팔레트를 조용히 덮어씀"
  - "서브에이전트 자체 보고에 이미 존재해야 할 파일을 '생성했다(created)'는 표현이 등장한 것이 이상 신호였음"
  - "별도의 task-reviewer 서브에이전트가 git diff만 보고 해당 파일이 'main에 최근에 추가된 것처럼 보인다'고 독립적으로 의심함"
  - "worktree 진입 직후 실행한 baseline npm test는 문제없이 통과해 코드베이스가 main과 동일하다는 잘못된 확신을 줌"
root_cause: config_error
resolution_type: environment_setup
related_components:
  - "tooling"
  - "testing_framework"
tags:
  - "git-worktree"
  - "enterworktree"
  - "subagent-driven-development"
  - "stale-branch"
  - "origin-main"
  - "baseline-testing"
  - "silent-data-loss"
  - "multi-agent-orchestration"
---

# 격리 워크트리가 origin/main 기준으로 생성되어 로컬 전용 커밋이 누락됨

## Context

격리된 git worktree는 다태스크 구현 계획을 subagent-driven-development에 넘길 때, 병렬 수정이 메인 체크아웃에서 충돌하지 않도록 하는 표준 방법이다. 워크플로는 다음과 같다: worktree를 생성하고, baseline이 건강해 보이는지 확인한 뒤, "지금 main이 어떤 상태인지"를 전제로 작성된 태스크 브리핑을 서브에이전트에 전달한다.

이번 장애는 그보다 한 단계 앞에서 시작됐다. worktree 생성 도구의 기본 branch point는 로컬 HEAD가 아니라 `origin/<default-branch>`다. 이 둘은 보통 같은 커밋이라 평소엔 구분이 안 보이는데, 그게 바로 위험한 지점이다 — 로컬 `main`에 아직 푸시하지 않은 커밋이 있을 때만 두 값이 갈라지고, 그 상태는 진행 중인 작업, 아직 리뷰 안 된 수정, 방금 만든 커밋처럼 지극히 일상적인 상황이다. 이번 사고에서는 로컬 `main`이 `origin/main`보다 커밋 2개 앞서 있었다. worktree는 낡은 `origin/main`을 기준으로 브랜치를 땄고, `mobile/src/shared/theme.ts`(전체 색상 팔레트)를 새로 추가하고, 그 팔레트를 참조하도록 다른 화면 파일 여러 개(`DailyDetailScreen.tsx` 등)를 함께 고치고, 별도로 `package.json`에 새 의존성(`@expo/vector-icons`)을 추가한 커밋 `493d250`(당시 로컬 전용 커밋 — 이후 rebase/squash로 SHA가 바뀔 수 있으므로 이 문서에서는 사고 당시의 참조로만 유효하다)을 조용히 빠뜨렸다. worktree 생성 과정에서는 이를 알리는 경고도, diff 요약도 없이 그냥 평범한 성공 메시지만 떴다.

이 낡은 상태는 그 후 깨끗한 baseline 테스트 실행까지 통과했다. worktree 진입 직후 `npm test`가 117/117 통과했고, 이는 "worktree가 main과 일치한다"는 확신으로 받아들여졌다. 이 추론은 타당하지 않다 — 그린 테스트 스위트는 체크아웃된 코드가 자기 자신의 테스트와 일치한다는 것만 증명할 뿐, 로컬 main의 실제 tip 같은 외부 기준점과 일치한다는 것은 증명하지 못한다. "내부적으로 일관됨"과 "내가 기대하는 것과 일치함" 사이의 간극이 바로 이 사고가 서브에이전트가 누락된 파일을 만나기 전까지 발견되지 않은 채 숨어 있던 곳이다.

## Guidance

- **격리 워크트리를 만들기 전이나 직후에, 로컬 main이 origin/main보다 앞서 있는지 확인한다.** 이 조건이 성립할 때 로컬 main에서 `git status`는 "브랜치가 origin/main보다 N개 커밋만큼 앞에 있습니다"라고 알려준다. `git rev-list --count origin/main..main`은 스크립트용으로 같은 답을 숫자로 준다. 0이 아닌 값이면 worktree의 실제 branch point를 신뢰하기 전에 반드시 다시 확인한다.
- **로컬이 앞서 있다면, worktree를 로컬 HEAD 기준으로 명시적으로 따거나(도구가 base ref 설정을 지원하는 경우), 진입 후 branch point를 검증한다.** 저렴한 검증 방법: 새 worktree 안에서 `git log --oneline -5`를 실행하고, 로컬 main 자체의 `git log --oneline -5`와 비교한다. tip 커밋이 다르면 worktree는 로컬 작업 대비 낡은 상태이며, 어떤 태스크 작업도 시작하기 전에 로컬 main의 실제 tip 위로 rebase해야 한다.
- **통과하는 baseline 테스트 스위트를 그 확인의 대체물로 삼지 않는다.** worktree 진입 직후의 그린 `npm test`(또는 동등한 명령)는 worktree의 파일들이 자기 자신의 테스트와 일치한다는 것만 알려준다. worktree가 로컬 main, `origin/main`, 혹은 다른 어떤 외부 기준점과 일치하는지는 전혀 알려주지 못한다. 그 확인에는 위의 git-log 비교를 쓰고, 테스트 실행은 실제로 존재하는 코드의 진짜 결함을 잡는 원래 용도로만 사용한다.
- **태스크 브리핑이 이미 존재한다고 전제한 파일에 대해 서브에이전트가 "만들었다"고 보고하면 구체적인 위험 신호로 취급한다.** 태스크 지시가 코드로 `import { colors } from '../../shared/theme';`(상대 경로 import 구문 — `mobile/src/shared/theme.ts`를 가리킴, 파일이 이미 존재하는 공용 인프라라는 전제)라고 적혀 있었는데 구현 서브에이전트의 자체 보고가 "Created: `mobile/src/shared/theme.ts`"라고 되어 있다면, 그 표현의 불일치는 직접 확인할 가치가 있다 — `git log --all -- <path>`는 해당 파일이 저장소 커밋 그래프 어디에든 이력이 있는지 보여주며, 이는 "진짜 새 파일"과 "현재 워크스페이스에서만 누락된 파일"을 구분해준다. 테스트 통과만 믿고 작업을 그대로 받아들이지 않는다 — 스텁으로 대체된 파일은 자기 자신의 테스트는 통과하면서도 앱의 다른 모든 화면이 의존하는 색상 토큰을 조용히 지워버릴 수 있다.
- **package.json을 건드리는 rebase나 merge 이후에는 node_modules가 이미 있어도 npm install을 다시 실행한다.** rebase 전부터 있던 node_modules는 rebase로 새로 들어온 의존성(이번 경우 `@expo/vector-icons`, rebase 대상 커밋이 추가한 것)을 반영하지 못한다. 첫 징후는 보통 설치 시점이 아니라 typecheck나 런타임에서 "Cannot find module" 에러로 나타난다 — rebase 직후 이 에러를 만나면 원인 불명의 버그가 아니라 package.json diff를 확인하라는 신호로 취급한다.

## Why This Matters

이번 구체적인 장애의 파급 범위는, 서브에이전트가 다른 이미 존재하는 화면들(`DailyDetailScreen.tsx` 등)이 의존하던 공용 스타일링 인프라인 `mobile/src/shared/theme.ts`를 한 줄짜리 스텁으로 조용히 덮어쓰면서도, 자체 보고에서는 진짜 새 파일에나 어울릴 법한 표현("Created...")을 썼다는 데 있다. 그 보고의 어떤 문장도 거짓은 아니었지만, 그 표현이 기존에 존재하던 공유 상태가 파괴됐다는 사실을 가려버렸다. 이런 종류의 실수는 저지르기는 매우 쉽고 잡아내기는 훨씬 어렵다 — 서브에이전트는 자기 환경이 낡았다는 것을 알 방법이 없었고, 그가 가진 모든 로컬 증거(해석되지 않는 import, 해당 경로에 파일 없음)가 똑같이 잘못된 결론을 가리키고 있었다.

이번엔 두 개의 독립적인 신호가 겹쳐서 잡혔다: 컨트롤러가 자체 보고의 표현을 태스크 브리핑이 실제로 요청한 것과 대조해봤고, 별도의 task-reviewer 서브에이전트가 순전히 diff만 보고 그 파일이 "main에 최근에 추가된 것처럼 보인다"고 지적했다. 두 신호 모두 보장된 것이 아니었다. 자체 보고의 표현이 태스크의 전제와 어긋나는지 검토하는 컨트롤러가 없고, 구현자의 서사에 이해관계가 없는 독립 리뷰어가 diff를 읽지 않는 워크플로였다면, 이 문제는 그대로 배포됐을 것이다 — 테스트는 통과했고, 보고는 정상적으로 들렸으며, 누락된 색상 토큰은 훨씬 나중에 관련 없어 보이는 화면들의 시각적 회귀로만 드러났을 것이다.

## When to Apply

격리된 작업 공간 — 구체적으로는 git worktree지만, "격리된 환경을 띄우고 자동화된 에이전트에게 넘긴다"는 패턴이라면(컨테이너, 새 체크아웃, 원격 ref에서 클론한 CI 샌드박스 등) 동일하게 적용된다 — 이 원격 추적 브랜치보다 앞서 있을 수 있는 움직이는 로컬 브랜치로부터 생성될 때는 언제나. 로컬에서 커밋이 먼저 만들어지고 나중에 푸시되는 저장소라면 사실상 항상 해당되므로, 실무적으로는 무언가 이미 잘못돼 보일 때만이 아니라 새로 만든 worktree에 subagent-driven-development를 붙이기 전에 습관적으로 확인할 가치가 있다.

## Examples

**Before (실제로 벌어진 일):**
1. 네이티브 도구로 worktree 생성 — 기본값으로 `origin/main`을 base ref로 사용.
2. 진입 직후 `npm test` 실행 — 117/117 통과 — worktree가 main과 일치한다는 증거로 받아들여짐.
3. 실제 로컬 main을 기준으로 작성된 브리핑으로 Task 1 구현자를 디스패치 — `import { colors } from '../../shared/theme'`를 지시.
4. (낡은) worktree에서 해당 import가 해석되지 않음. 서브에이전트는 파일이 애초에 없었다고 결론짓고 한 줄짜리 스텁을 만들어, 원래 있었어야 할 전체 색상 팔레트를 덮어씀.
5. 자체 보고에 "Created: `mobile/src/shared/theme.ts` — Color token definitions"라고 적힘 — 진짜 새 파일과 구분할 수 없는 표현.
6. 하류에서만 발견됨: 컨트롤러가 보고 내용이 브리핑의 전제와 다르다는 걸 알아채고 `git show <base>^:mobile/src/shared/theme.ts`를 확인; 별도로 task-reviewer가 diff만 보고 해당 파일이 최근에 추가된 것처럼 보인다고 지적.

**After (이 가이드가 정립하는 방식):**
1. worktree 생성.
2. 즉시: worktree 안에서 `git log --oneline -5`를 로컬 main의 `git log --oneline -5`와 비교. 여기서처럼 갈라져 있다면(`493d250` 누락) 어떤 태스크 작업도 디스패치하기 전에 멈춘다.
3. worktree를 로컬 main의 실제 tip 위로 rebase(`git rebase <local-main-tip>`)하고, 충돌을 해결한다(예: rebase와 진행 중이던 태스크 커밋이 동시에 건드린 import/JSX 블록의 양쪽을 합치거나, 새로 추가된 파일의 add/add 충돌에서 더 온전한 쪽을 유지).
4. rebase가 package.json을 건드렸다면 npm install을 다시 실행.
5. 그제서야 태스크 브리핑을 디스패치한다 — 이제 브리핑이 작성된 환경과 실제 환경이 일치한다고 보장되므로, 서브에이전트가 누락된 import를 만나는 것은 워크스페이스가 낡아서 생긴 거짓 신호가 아니라 진짜로 조사할 가치가 있는 신호가 된다.

## Related

- [`cross-user-uuid-reuse-guard-must-be-repeated-per-repository.md`](../logic-errors/cross-user-uuid-reuse-guard-must-be-repeated-per-repository.md) — 도메인은 다르지만("git worktree 환경 설정" vs. "애플리케이션 계층 소유권 검사"), "더 좁은 범위의 검증(태스크 리뷰 / baseline 테스트)이 놓친 것을 더 넓은/나중의 검증(전체 브랜치 리뷰 / 실제 파일 diff 대조)에서만 잡아냈다"는 패턴이 느슨하게 겹친다.
