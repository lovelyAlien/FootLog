# Concepts

Shared domain vocabulary for this project — entities, named processes, and status concepts with project-specific meaning. Seeded with core domain vocabulary, then accretes as ce-compound and ce-compound-refresh process learnings; direct edits are fine. Glossary only, not a spec or catch-all.

## Check-in

사용자가 현재 위치를 확인하고 명시적으로 확정하여 특정 시각과 위치의 발자국을 남기는 행위다. 화면 캡처와 혼동되는 “캡처”라는 표현은 사용하지 않는다.

## Local-first Check-in

네트워크나 서버 상태와 무관하게 기기 저장소에 먼저 완료되고, 서버는 이후 백업과 다기기 동기화를 담당하는 체크인이다.

## Activity Window

시간별 체크인 알림이 허용되는 하루의 시작 시각과 종료 시각 범위다. 유한한 예약 horizon은 앱 수명주기에서 주기적으로 다시 계산되어야 한다.

## Scheduled Notification Ownership

FootLog가 생성한 로컬 알림만 해당 식별자로 추적하고 취소하는 소유권 규칙이다. 취소에 실패한 식별자는 다음 정리 시도를 위해 보존한다.

## Ownership Masking

다른 사용자 소유 리소스에 대한 서버 API 접근을, 그 리소스가 존재하는지 여부를 노출하지 않기 위해 403이 아닌 404로 응답하는 규칙이다. 클라이언트 생성 UUID가 다른 사용자의 기존 리소스와 충돌하는 경우에도 동일하게 적용되며, `{ENTITY}_NOT_FOUND` 형태의 에러 코드로 표현된다.
