# 동기화 도메인 백엔드 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `docs/2026-08-16-sync-domain-schema-api-design.md`에 정의된 체크인·메모·회고·사진 첨부 도메인의 PostgreSQL 테이블과 API 계약을 Spring Boot 백엔드에 구현한다.

**Architecture:** JdbcTemplate 기반 리포지토리(JPA 미사용, 기존 `PostgisContextTest` 패턴을 따름) + 도메인별 `@RestController`. 모든 쓰기는 같은 트랜잭션 안에서 `sync_change_log`에 append한다. 인증은 미구현 상태이므로 `CurrentUserProvider` 인터페이스 뒤에 헤더 기반 스텁을 둔다. 사진 객체 스토리지는 `ObjectStorageClient` 인터페이스 뒤에 스텁을 둔다.

**Tech Stack:** Spring Boot 4.1.0, JDK 21, Gradle Wrapper, PostgreSQL(JdbcTemplate) + Flyway, Testcontainers(`postgis/postgis:17-3.5`), JUnit 5, AssertJ.

## Global Constraints

- 커밋 메시지는 한글, Conventional Commits(`type(scope): 설명`) 형식. `Co-Authored-By` 등 AI 서명 트레일러 금지. (`~/.claude/CLAUDE.md`)
- 백엔드 명령은 반드시 `JAVA_HOME=$(/usr/libexec/java_home -v 21)`로 JDK 21을 지정해 Gradle Wrapper로 실행한다. (`CLAUDE.md`)
- JSON 필드는 camelCase, DB 컬럼은 snake_case, 타임스탬프는 ISO-8601 UTC 문자열/`timestamptz`, 에러 응답은 `{ "code": "...", "message": "..." }`. (`docs/2026-08-16-sync-domain-schema-api-design.md` 1절)
- `user_id` 컬럼에는 FK를 걸지 않는다 — `users` 테이블은 별도 인증 설계 문서가 도입한다. (설계 문서 범위 제외 명시)
- 모든 쓰기/조회 API는 세션 대신 `X-Debug-User-Id` 헤더(UUID 문자열)로 사용자를 식별한다 — `CurrentUserProvider` 인터페이스 뒤의 임시 스텁이며, 카카오 세션 구현이 나오면 이 구현체만 교체한다.
- 통합 테스트는 로컬 Docker 데몬이 필요하다(Testcontainers). 각 태스크의 테스트 실행 전 Docker가 떠 있는지 확인한다.
- Spring Boot의 Jackson 자동 설정이 `Instant`/`LocalDate`를 ISO-8601 문자열로 (역)직렬화하므로 별도 설정은 필요 없다.
- **[실행 중 발견] Jackson 패키지**: 이 프로젝트의 Spring Boot 4.1.0은 Jackson 3.x를 사용하므로 `ObjectMapper`/`JsonNode`는 `com.fasterxml.jackson.databind.*`가 아니라 `tools.jackson.databind.*`에서 import한다(Task 3에서 확인·수정됨).
- **[실행 중 발견] 컨트롤러 통합 테스트**: 이 프로젝트의 `spring-boot-test:4.1.0`에는 `TestRestTemplate`이 없다(클래스 자체가 존재하지 않음, Task 5에서 확인됨). 컨트롤러 통합 테스트는 `TestRestTemplate` 대신 MockMvc를 사용한다 — `@SpringBootTest(webEnvironment = RANDOM_PORT)` + `@Autowired WebApplicationContext` + `MockMvcBuilders.webAppContextSetup(webApplicationContext).build()`, 요청은 `MockMvcRequestBuilders`(`put`/`delete`/`post`/`get`), 응답 검증은 `MockMvcResultMatchers`(`status()`, `jsonPath()`)를 사용한다. JSON 요청 바디는 Java 텍스트 블록 문자열로 직접 작성한다(Map 대신). 이 패턴은 `backend/src/test/java/com/footlog/api/checkin/CheckInControllerTest.java`에 이미 구현되어 있으므로 이후 컨트롤러 테스트 태스크(7, 9, 11, 12, 13)는 이를 참고한다.

---

### Task 1: 공통 에러 처리 인프라

**Files:**
- Create: `backend/src/main/java/com/footlog/api/common/ApiException.java`
- Create: `backend/src/main/java/com/footlog/api/common/ApiError.java`
- Create: `backend/src/main/java/com/footlog/api/common/DeletedAtRequest.java`
- Create: `backend/src/main/java/com/footlog/api/common/GlobalExceptionHandler.java`
- Test: `backend/src/test/java/com/footlog/api/common/GlobalExceptionHandlerTest.java`

**Interfaces:**
- Produces: `ApiException(HttpStatus status, String code, String message)` — 이후 모든 리포지토리/컨트롤러가 도메인 에러를 던질 때 사용. `ApiError(String code, String message)` record — 에러 응답 바디. `DeletedAtRequest(Instant deletedAt)` record — 모든 DELETE 요청 바디.

- [ ] **Step 1: 실패하는 테스트 작성**

```java
package com.footlog.api.common;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

import static org.assertj.core.api.Assertions.assertThat;

class GlobalExceptionHandlerTest {

  private final GlobalExceptionHandler handler = new GlobalExceptionHandler();

  @Test
  void mapsApiExceptionToItsStatusAndCode() {
    ApiException ex = new ApiException(HttpStatus.CONFLICT, "CHECK_IN_IMMUTABLE", "체크인은 생성 후 수정할 수 없습니다");

    ResponseEntity<ApiError> response = handler.handleApiException(ex);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.CONFLICT);
    assertThat(response.getBody().code()).isEqualTo("CHECK_IN_IMMUTABLE");
    assertThat(response.getBody().message()).isEqualTo("체크인은 생성 후 수정할 수 없습니다");
  }

  @Test
  void mapsUnreadableRequestBodyToValidationError() {
    ResponseEntity<ApiError> response = handler.handleBadRequest(
        new org.springframework.http.converter.HttpMessageNotReadableException(
            "bad json", (org.springframework.http.HttpInputMessage) null));

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
    assertThat(response.getBody().code()).isEqualTo("VALIDATION_ERROR");
  }
}
```

- [ ] **Step 2: 테스트 실행해서 실패 확인**

Run: `cd backend && JAVA_HOME=$(/usr/libexec/java_home -v 21) ./gradlew test --tests "com.footlog.api.common.GlobalExceptionHandlerTest"`
Expected: 컴파일 실패 (`ApiException`, `ApiError`, `GlobalExceptionHandler`가 아직 없음)

- [ ] **Step 3: 최소 구현 작성**

```java
package com.footlog.api.common;

public record ApiError(String code, String message) {}
```

```java
package com.footlog.api.common;

import org.springframework.http.HttpStatus;

public class ApiException extends RuntimeException {

  private final HttpStatus status;
  private final String code;

  public ApiException(HttpStatus status, String code, String message) {
    super(message);
    this.status = status;
    this.code = code;
  }

  public HttpStatus getStatus() {
    return status;
  }

  public String getCode() {
    return code;
  }
}
```

```java
package com.footlog.api.common;

import java.time.Instant;

public record DeletedAtRequest(Instant deletedAt) {}
```

```java
package com.footlog.api.common;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;

@RestControllerAdvice
public class GlobalExceptionHandler {

  @ExceptionHandler(ApiException.class)
  public ResponseEntity<ApiError> handleApiException(ApiException ex) {
    return ResponseEntity.status(ex.getStatus()).body(new ApiError(ex.getCode(), ex.getMessage()));
  }

  @ExceptionHandler({HttpMessageNotReadableException.class, MethodArgumentTypeMismatchException.class})
  public ResponseEntity<ApiError> handleBadRequest(Exception ex) {
    return ResponseEntity.status(HttpStatus.BAD_REQUEST)
        .body(new ApiError("VALIDATION_ERROR", "요청 형식이 올바르지 않습니다"));
  }
}
```

- [ ] **Step 4: 테스트 실행해서 통과 확인**

Run: `cd backend && JAVA_HOME=$(/usr/libexec/java_home -v 21) ./gradlew test --tests "com.footlog.api.common.GlobalExceptionHandlerTest"`
Expected: `BUILD SUCCESSFUL`, 2개 테스트 통과

- [ ] **Step 5: 커밋**

```bash
cd backend
git add src/main/java/com/footlog/api/common src/test/java/com/footlog/api/common
git commit -m "feat(api): 공통 에러 응답 인프라 추가"
```

---

### Task 2: 임시 사용자 컨텍스트 (CurrentUserProvider)

**Files:**
- Create: `backend/src/main/java/com/footlog/api/auth/CurrentUserProvider.java`
- Create: `backend/src/main/java/com/footlog/api/auth/HeaderCurrentUserProvider.java`
- Test: `backend/src/test/java/com/footlog/api/auth/HeaderCurrentUserProviderTest.java`

**Interfaces:**
- Consumes: `ApiException` (Task 1)
- Produces: `CurrentUserProvider.currentUserId(): UUID` — 이후 모든 컨트롤러가 이 인터페이스로 사용자 식별. 실제 카카오 세션 구현이 생기면 `HeaderCurrentUserProvider`만 교체.

- [ ] **Step 1: 실패하는 테스트 작성**

```java
package com.footlog.api.auth;

import com.footlog.api.common.ApiException;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class HeaderCurrentUserProviderTest {

  @Test
  void readsUserIdFromHeader() {
    UUID userId = UUID.randomUUID();
    MockHttpServletRequest request = new MockHttpServletRequest();
    request.addHeader(HeaderCurrentUserProvider.USER_ID_HEADER, userId.toString());

    HeaderCurrentUserProvider provider = new HeaderCurrentUserProvider(request);

    assertThat(provider.currentUserId()).isEqualTo(userId);
  }

  @Test
  void rejectsMissingHeader() {
    HeaderCurrentUserProvider provider = new HeaderCurrentUserProvider(new MockHttpServletRequest());

    assertThatThrownBy(provider::currentUserId).isInstanceOf(ApiException.class);
  }

  @Test
  void rejectsInvalidUuid() {
    MockHttpServletRequest request = new MockHttpServletRequest();
    request.addHeader(HeaderCurrentUserProvider.USER_ID_HEADER, "not-a-uuid");

    HeaderCurrentUserProvider provider = new HeaderCurrentUserProvider(request);

    assertThatThrownBy(provider::currentUserId).isInstanceOf(ApiException.class);
  }
}
```

- [ ] **Step 2: 테스트 실행해서 실패 확인**

Run: `cd backend && JAVA_HOME=$(/usr/libexec/java_home -v 21) ./gradlew test --tests "com.footlog.api.auth.HeaderCurrentUserProviderTest"`
Expected: 컴파일 실패 (`CurrentUserProvider`, `HeaderCurrentUserProvider`가 아직 없음)

- [ ] **Step 3: 최소 구현 작성**

```java
package com.footlog.api.auth;

import java.util.UUID;

public interface CurrentUserProvider {
  UUID currentUserId();
}
```

```java
package com.footlog.api.auth;

import com.footlog.api.common.ApiException;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.context.annotation.RequestScope;

import java.util.UUID;

/**
 * 카카오 세션 인증이 구현되기 전까지 사용하는 임시 스텁.
 * 실제 인증이 들어오면 이 구현체만 세션 기반으로 교체한다.
 */
@Component
@RequestScope
public class HeaderCurrentUserProvider implements CurrentUserProvider {

  public static final String USER_ID_HEADER = "X-Debug-User-Id";

  private final HttpServletRequest request;

  public HeaderCurrentUserProvider(HttpServletRequest request) {
    this.request = request;
  }

  @Override
  public UUID currentUserId() {
    String header = request.getHeader(USER_ID_HEADER);
    if (header == null || header.isBlank()) {
      throw new ApiException(HttpStatus.UNAUTHORIZED, "MISSING_USER_ID_HEADER",
          "요청에 " + USER_ID_HEADER + " 헤더가 필요합니다");
    }
    try {
      return UUID.fromString(header);
    } catch (IllegalArgumentException e) {
      throw new ApiException(HttpStatus.UNAUTHORIZED, "INVALID_USER_ID_HEADER",
          USER_ID_HEADER + " 값이 올바른 UUID가 아닙니다");
    }
  }
}
```

- [ ] **Step 4: 테스트 실행해서 통과 확인**

Run: `cd backend && JAVA_HOME=$(/usr/libexec/java_home -v 21) ./gradlew test --tests "com.footlog.api.auth.HeaderCurrentUserProviderTest"`
Expected: `BUILD SUCCESSFUL`, 3개 테스트 통과

- [ ] **Step 5: 커밋**

```bash
cd backend
git add src/main/java/com/footlog/api/auth src/test/java/com/footlog/api/auth
git commit -m "feat(auth): 헤더 기반 임시 사용자 식별 스텁 추가"
```

---

### Task 3: sync_change_log 테이블과 리포지토리

**Files:**
- Create: `backend/src/main/resources/db/migration/V2__create_sync_change_log.sql`
- Create: `backend/src/main/java/com/footlog/api/sync/SyncChangeRow.java`
- Create: `backend/src/main/java/com/footlog/api/sync/SyncChangeLogRepository.java`
- Test: `backend/src/test/java/com/footlog/api/sync/SyncChangeLogRepositoryTest.java`

**Interfaces:**
- Produces: `SyncChangeLogRepository.append(UUID userId, String entityType, UUID entityId, String operation, Object payload, Instant occurredAt): void` — Task 4/6/8/10에서 도메인 쓰기와 같은 트랜잭션으로 호출. `SyncChangeLogRepository.listSince(UUID userId, long cursor, int limit): List<SyncChangeRow>` — Task 13(sync 컨트롤러)에서 사용.

- [ ] **Step 1: 마이그레이션 작성**

```sql
-- backend/src/main/resources/db/migration/V2__create_sync_change_log.sql
CREATE TABLE IF NOT EXISTS sync_change_log (
  seq BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('check_in','check_in_note','daily_reflection','photo_attachment')),
  entity_id UUID NOT NULL,
  operation TEXT NOT NULL CHECK (operation IN ('create','update','delete')),
  payload JSONB,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sync_change_log_user_seq
  ON sync_change_log(user_id, seq);
```

- [ ] **Step 2: 실패하는 테스트 작성**

```java
package com.footlog.api.sync;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest
@Testcontainers
class SyncChangeLogRepositoryTest {

  @Container
  static final PostgreSQLContainer<?> postgres =
      new PostgreSQLContainer<>(DockerImageName.parse("postgis/postgis:17-3.5")
          .asCompatibleSubstituteFor("postgres"));

  @DynamicPropertySource
  static void registerDataSourceProperties(DynamicPropertyRegistry registry) {
    registry.add("spring.datasource.url", postgres::getJdbcUrl);
    registry.add("spring.datasource.username", postgres::getUsername);
    registry.add("spring.datasource.password", postgres::getPassword);
  }

  @Autowired SyncChangeLogRepository repository;

  @Test
  void appendsAndListsSinceCursorForOwningUserOnly() {
    UUID userId = UUID.randomUUID();
    UUID otherUserId = UUID.randomUUID();
    UUID entityId = UUID.randomUUID();
    Instant now = Instant.parse("2026-08-16T09:00:00Z");

    repository.append(userId, "check_in", entityId, "create", Map.of("latitude", 37.5), now);
    repository.append(otherUserId, "check_in", UUID.randomUUID(), "create", Map.of("latitude", 1.0), now);

    List<SyncChangeRow> rows = repository.listSince(userId, 0, 200);

    assertThat(rows).hasSize(1);
    assertThat(rows.get(0).entityId()).isEqualTo(entityId);
    assertThat(rows.get(0).operation()).isEqualTo("create");
    assertThat(rows.get(0).payloadJson()).contains("37.5");
  }

  @Test
  void deleteOperationsAllowNullPayload() {
    UUID userId = UUID.randomUUID();
    UUID entityId = UUID.randomUUID();
    Instant now = Instant.parse("2026-08-16T09:00:00Z");

    repository.append(userId, "check_in", entityId, "delete", null, now);

    List<SyncChangeRow> rows = repository.listSince(userId, 0, 200);

    assertThat(rows).hasSize(1);
    assertThat(rows.get(0).payloadJson()).isNull();
  }
}
```

- [ ] **Step 3: 테스트 실행해서 실패 확인**

Run: `cd backend && JAVA_HOME=$(/usr/libexec/java_home -v 21) ./gradlew test --tests "com.footlog.api.sync.SyncChangeLogRepositoryTest"`
Expected: 컴파일 실패 (`SyncChangeRow`, `SyncChangeLogRepository`가 아직 없음)

- [ ] **Step 4: 최소 구현 작성**

```java
package com.footlog.api.sync;

import java.time.Instant;
import java.util.UUID;

public record SyncChangeRow(long seq, String entityType, UUID entityId, String operation, String payloadJson, Instant occurredAt) {}
```

```java
package com.footlog.api.sync;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

@Repository
public class SyncChangeLogRepository {

  private final JdbcTemplate jdbcTemplate;
  private final ObjectMapper objectMapper;

  public SyncChangeLogRepository(JdbcTemplate jdbcTemplate, ObjectMapper objectMapper) {
    this.jdbcTemplate = jdbcTemplate;
    this.objectMapper = objectMapper;
  }

  public void append(UUID userId, String entityType, UUID entityId, String operation, Object payload, Instant occurredAt) {
    String payloadJson = payload == null ? null : writeJson(payload);
    jdbcTemplate.update(
        "INSERT INTO sync_change_log (user_id, entity_type, entity_id, operation, payload, occurred_at) " +
            "VALUES (?, ?, ?, ?, ?::jsonb, ?)",
        userId, entityType, entityId, operation, payloadJson, Timestamp.from(occurredAt));
  }

  public List<SyncChangeRow> listSince(UUID userId, long cursor, int limit) {
    return jdbcTemplate.query(
        "SELECT seq, entity_type, entity_id, operation, payload::text AS payload_text, occurred_at " +
            "FROM sync_change_log WHERE user_id = ? AND seq > ? ORDER BY seq LIMIT ?",
        (rs, rowNum) -> new SyncChangeRow(
            rs.getLong("seq"),
            rs.getString("entity_type"),
            UUID.fromString(rs.getString("entity_id")),
            rs.getString("operation"),
            rs.getString("payload_text"),
            rs.getTimestamp("occurred_at").toInstant()),
        userId, cursor, limit);
  }

  private String writeJson(Object payload) {
    try {
      return objectMapper.writeValueAsString(payload);
    } catch (Exception e) {
      throw new IllegalStateException("payload 직렬화 실패", e);
    }
  }
}
```

- [ ] **Step 5: 테스트 실행해서 통과 확인**

Run: `cd backend && JAVA_HOME=$(/usr/libexec/java_home -v 21) ./gradlew test --tests "com.footlog.api.sync.SyncChangeLogRepositoryTest"`
Expected: `BUILD SUCCESSFUL`, 2개 테스트 통과

- [ ] **Step 6: 커밋**

```bash
cd backend
git add src/main/resources/db/migration/V2__create_sync_change_log.sql src/main/java/com/footlog/api/sync src/test/java/com/footlog/api/sync
git commit -m "feat(sync): sync_change_log 테이블과 append/조회 리포지토리 추가"
```

---

### Task 4: check_ins 테이블과 리포지토리

**Files:**
- Create: `backend/src/main/resources/db/migration/V3__create_check_ins.sql`
- Create: `backend/src/main/java/com/footlog/api/checkin/CheckIn.java`
- Create: `backend/src/main/java/com/footlog/api/checkin/CheckInRepository.java`
- Test: `backend/src/test/java/com/footlog/api/checkin/CheckInRepositoryTest.java`

**Interfaces:**
- Consumes: `SyncChangeLogRepository.append(...)` (Task 3), `ApiException` (Task 1)
- Produces: `CheckIn` record(`id, userId, latitude, longitude, accuracyM, capturedAt, checkedInAt, createdAt, deletedAt`). `CheckInRepository.findById(UUID): Optional<CheckIn>`, `.upsert(CheckIn candidate): CheckIn`, `.softDelete(UUID userId, UUID id, Instant deletedAt): void` — Task 12(연쇄 삭제)가 `softDelete`를 사용.

- [ ] **Step 1: 마이그레이션 작성**

```sql
-- backend/src/main/resources/db/migration/V3__create_check_ins.sql
-- user_id에는 FK를 걸지 않는다: users 테이블은 별도 인증 설계 문서에서 도입한다.
CREATE TABLE IF NOT EXISTS check_ins (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  accuracy_m DOUBLE PRECISION NOT NULL CHECK (accuracy_m >= 0),
  captured_at TIMESTAMPTZ NOT NULL,
  checked_in_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_check_ins_user_checked_in_at
  ON check_ins(user_id, checked_in_at);

CREATE INDEX IF NOT EXISTS idx_check_ins_user_active
  ON check_ins(user_id) WHERE deleted_at IS NULL;
```

- [ ] **Step 2: 실패하는 테스트 작성**

```java
package com.footlog.api.checkin;

import com.footlog.api.common.ApiException;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;

import java.time.Instant;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@SpringBootTest
@Testcontainers
class CheckInRepositoryTest {

  @Container
  static final PostgreSQLContainer<?> postgres =
      new PostgreSQLContainer<>(DockerImageName.parse("postgis/postgis:17-3.5")
          .asCompatibleSubstituteFor("postgres"));

  @DynamicPropertySource
  static void registerDataSourceProperties(DynamicPropertyRegistry registry) {
    registry.add("spring.datasource.url", postgres::getJdbcUrl);
    registry.add("spring.datasource.username", postgres::getUsername);
    registry.add("spring.datasource.password", postgres::getPassword);
  }

  @Autowired CheckInRepository checkInRepository;
  @Autowired JdbcTemplate jdbcTemplate;

  private CheckIn newCandidate(UUID userId, UUID id, double latitude) {
    Instant now = Instant.parse("2026-08-16T09:00:00Z");
    return new CheckIn(id, userId, latitude, 127.0, 15.0, now, now, now, null);
  }

  @Test
  void insertsNewCheckInAndRecordsSyncLog() {
    UUID userId = UUID.randomUUID();
    UUID id = UUID.randomUUID();

    CheckIn saved = checkInRepository.upsert(newCandidate(userId, id, 37.5));

    assertThat(saved.id()).isEqualTo(id);
    Integer logCount = jdbcTemplate.queryForObject(
        "SELECT count(*) FROM sync_change_log WHERE entity_id = ? AND operation = 'create'",
        Integer.class, id);
    assertThat(logCount).isEqualTo(1);
  }

  @Test
  void retryingIdenticalPayloadIsIdempotentAndDoesNotDuplicateLog() {
    UUID userId = UUID.randomUUID();
    UUID id = UUID.randomUUID();
    CheckIn candidate = newCandidate(userId, id, 37.5);

    checkInRepository.upsert(candidate);
    CheckIn second = checkInRepository.upsert(candidate);

    assertThat(second.id()).isEqualTo(id);
    Integer logCount = jdbcTemplate.queryForObject(
        "SELECT count(*) FROM sync_change_log WHERE entity_id = ?", Integer.class, id);
    assertThat(logCount).isEqualTo(1);
  }

  @Test
  void rejectsDifferentPayloadForSameId() {
    UUID userId = UUID.randomUUID();
    UUID id = UUID.randomUUID();
    checkInRepository.upsert(newCandidate(userId, id, 37.5));

    assertThatThrownBy(() -> checkInRepository.upsert(newCandidate(userId, id, 38.0)))
        .isInstanceOf(ApiException.class);
  }

  @Test
  void softDeleteIsIdempotentAndRecordsSyncLog() {
    UUID userId = UUID.randomUUID();
    UUID id = UUID.randomUUID();
    checkInRepository.upsert(newCandidate(userId, id, 37.5));
    Instant deletedAt = Instant.parse("2026-08-16T10:00:00Z");

    checkInRepository.softDelete(userId, id, deletedAt);
    checkInRepository.softDelete(userId, id, deletedAt);

    assertThat(checkInRepository.findById(id).orElseThrow().deletedAt()).isEqualTo(deletedAt);
    Integer logCount = jdbcTemplate.queryForObject(
        "SELECT count(*) FROM sync_change_log WHERE entity_id = ? AND operation = 'delete'",
        Integer.class, id);
    assertThat(logCount).isEqualTo(1);
  }
}
```

- [ ] **Step 3: 테스트 실행해서 실패 확인**

Run: `cd backend && JAVA_HOME=$(/usr/libexec/java_home -v 21) ./gradlew test --tests "com.footlog.api.checkin.CheckInRepositoryTest"`
Expected: 컴파일 실패 (`CheckIn`, `CheckInRepository`가 아직 없음)

- [ ] **Step 4: 최소 구현 작성**

```java
package com.footlog.api.checkin;

import java.time.Instant;
import java.util.UUID;

public record CheckIn(
    UUID id,
    UUID userId,
    double latitude,
    double longitude,
    double accuracyM,
    Instant capturedAt,
    Instant checkedInAt,
    Instant createdAt,
    Instant deletedAt) {}
```

```java
package com.footlog.api.checkin;

import com.footlog.api.common.ApiException;
import com.footlog.api.sync.SyncChangeLogRepository;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public class CheckInRepository {

  private static final RowMapper<CheckIn> ROW_MAPPER = (rs, rowNum) -> new CheckIn(
      UUID.fromString(rs.getString("id")),
      UUID.fromString(rs.getString("user_id")),
      rs.getDouble("latitude"),
      rs.getDouble("longitude"),
      rs.getDouble("accuracy_m"),
      rs.getTimestamp("captured_at").toInstant(),
      rs.getTimestamp("checked_in_at").toInstant(),
      rs.getTimestamp("created_at").toInstant(),
      rs.getTimestamp("deleted_at") == null ? null : rs.getTimestamp("deleted_at").toInstant());

  private final JdbcTemplate jdbcTemplate;
  private final SyncChangeLogRepository syncChangeLogRepository;

  public CheckInRepository(JdbcTemplate jdbcTemplate, SyncChangeLogRepository syncChangeLogRepository) {
    this.jdbcTemplate = jdbcTemplate;
    this.syncChangeLogRepository = syncChangeLogRepository;
  }

  public Optional<CheckIn> findById(UUID id) {
    List<CheckIn> rows = jdbcTemplate.query("SELECT * FROM check_ins WHERE id = ?", ROW_MAPPER, id);
    return rows.stream().findFirst();
  }

  @Transactional
  public CheckIn upsert(CheckIn candidate) {
    Optional<CheckIn> existing = findById(candidate.id());

    if (existing.isEmpty()) {
      jdbcTemplate.update(
          "INSERT INTO check_ins (id, user_id, latitude, longitude, accuracy_m, captured_at, checked_in_at, created_at) " +
              "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
          candidate.id(), candidate.userId(), candidate.latitude(), candidate.longitude(), candidate.accuracyM(),
          Timestamp.from(candidate.capturedAt()), Timestamp.from(candidate.checkedInAt()),
          Timestamp.from(candidate.createdAt()));
      syncChangeLogRepository.append(candidate.userId(), "check_in", candidate.id(), "create", candidate, candidate.createdAt());
      return candidate;
    }

    CheckIn current = existing.get();
    if (!current.userId().equals(candidate.userId())) {
      throw new ApiException(HttpStatus.NOT_FOUND, "CHECK_IN_NOT_FOUND", "체크인을 찾을 수 없습니다");
    }
    if (isSamePayload(current, candidate)) {
      return current;
    }
    throw new ApiException(HttpStatus.CONFLICT, "CHECK_IN_IMMUTABLE", "체크인은 생성 후 수정할 수 없습니다");
  }

  @Transactional
  public void softDelete(UUID userId, UUID id, Instant deletedAt) {
    Optional<CheckIn> existing = findById(id);
    if (existing.isEmpty() || !existing.get().userId().equals(userId) || existing.get().deletedAt() != null) {
      return;
    }
    jdbcTemplate.update("UPDATE check_ins SET deleted_at = ? WHERE id = ?", Timestamp.from(deletedAt), id);
    syncChangeLogRepository.append(userId, "check_in", id, "delete", null, deletedAt);
  }

  private boolean isSamePayload(CheckIn a, CheckIn b) {
    return Double.compare(a.latitude(), b.latitude()) == 0
        && Double.compare(a.longitude(), b.longitude()) == 0
        && Double.compare(a.accuracyM(), b.accuracyM()) == 0
        && a.capturedAt().equals(b.capturedAt())
        && a.checkedInAt().equals(b.checkedInAt())
        && a.createdAt().equals(b.createdAt());
  }
}
```

- [ ] **Step 5: 테스트 실행해서 통과 확인**

Run: `cd backend && JAVA_HOME=$(/usr/libexec/java_home -v 21) ./gradlew test --tests "com.footlog.api.checkin.CheckInRepositoryTest"`
Expected: `BUILD SUCCESSFUL`, 4개 테스트 통과

- [ ] **Step 6: 커밋**

```bash
cd backend
git add src/main/resources/db/migration/V3__create_check_ins.sql src/main/java/com/footlog/api/checkin src/test/java/com/footlog/api/checkin
git commit -m "feat(check-in): check_ins 테이블과 생성 전용 리포지토리 추가"
```

---

### Task 5: 체크인 생성 API (PUT)

**Files:**
- Create: `backend/src/main/java/com/footlog/api/checkin/CheckInRequest.java`
- Create: `backend/src/main/java/com/footlog/api/checkin/CheckInResponse.java`
- Create: `backend/src/main/java/com/footlog/api/checkin/CheckInController.java`
- Test: `backend/src/test/java/com/footlog/api/checkin/CheckInControllerTest.java`

**Interfaces:**
- Consumes: `CheckInRepository`(Task 4), `CurrentUserProvider`(Task 2)
- Produces: `PUT /v1/check-ins/{id}`. `CheckInController`는 Task 12에서 `CheckInDeletionService`를 주입받아 `DELETE` 매핑이 추가된다(지금은 PUT만 존재).

- [ ] **Step 1: 실패하는 테스트 작성**

```java
package com.footlog.api.checkin;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;

import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@Testcontainers
class CheckInControllerTest {

  @Container
  static final PostgreSQLContainer<?> postgres =
      new PostgreSQLContainer<>(DockerImageName.parse("postgis/postgis:17-3.5")
          .asCompatibleSubstituteFor("postgres"));

  @DynamicPropertySource
  static void registerDataSourceProperties(DynamicPropertyRegistry registry) {
    registry.add("spring.datasource.url", postgres::getJdbcUrl);
    registry.add("spring.datasource.username", postgres::getUsername);
    registry.add("spring.datasource.password", postgres::getPassword);
  }

  @Autowired TestRestTemplate restTemplate;

  private HttpHeaders headersFor(UUID userId) {
    HttpHeaders headers = new HttpHeaders();
    headers.set("X-Debug-User-Id", userId.toString());
    headers.set("Content-Type", "application/json");
    return headers;
  }

  @Test
  void putCreatesCheckIn() {
    UUID userId = UUID.randomUUID();
    UUID checkInId = UUID.randomUUID();
    Map<String, Object> body = Map.of(
        "latitude", 37.5,
        "longitude", 127.0,
        "accuracyM", 12.5,
        "capturedAt", "2026-08-16T09:00:00Z",
        "checkedInAt", "2026-08-16T09:00:05Z",
        "createdAt", "2026-08-16T09:00:06Z");

    var response = restTemplate.exchange(
        "/v1/check-ins/" + checkInId, HttpMethod.PUT, new HttpEntity<>(body, headersFor(userId)), CheckInResponse.class);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody().id()).isEqualTo(checkInId);
  }

  @Test
  void missingUserHeaderIsRejected() {
    UUID checkInId = UUID.randomUUID();
    HttpHeaders headers = new HttpHeaders();
    headers.set("Content-Type", "application/json");
    Map<String, Object> body = Map.of(
        "latitude", 37.5, "longitude", 127.0, "accuracyM", 12.5,
        "capturedAt", "2026-08-16T09:00:00Z", "checkedInAt", "2026-08-16T09:00:05Z", "createdAt", "2026-08-16T09:00:06Z");

    var response = restTemplate.exchange(
        "/v1/check-ins/" + checkInId, HttpMethod.PUT, new HttpEntity<>(body, headers), String.class);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
  }
}
```

- [ ] **Step 2: 테스트 실행해서 실패 확인**

Run: `cd backend && JAVA_HOME=$(/usr/libexec/java_home -v 21) ./gradlew test --tests "com.footlog.api.checkin.CheckInControllerTest"`
Expected: 컴파일 실패 (`CheckInRequest`, `CheckInResponse`, `CheckInController`가 아직 없음)

- [ ] **Step 3: 최소 구현 작성**

```java
package com.footlog.api.checkin;

import java.time.Instant;

public record CheckInRequest(double latitude, double longitude, double accuracyM,
                              Instant capturedAt, Instant checkedInAt, Instant createdAt) {}
```

```java
package com.footlog.api.checkin;

import java.time.Instant;
import java.util.UUID;

public record CheckInResponse(UUID id, double latitude, double longitude, double accuracyM,
                               Instant capturedAt, Instant checkedInAt, Instant createdAt, Instant deletedAt) {

  static CheckInResponse from(CheckIn checkIn) {
    return new CheckInResponse(checkIn.id(), checkIn.latitude(), checkIn.longitude(), checkIn.accuracyM(),
        checkIn.capturedAt(), checkIn.checkedInAt(), checkIn.createdAt(), checkIn.deletedAt());
  }
}
```

```java
package com.footlog.api.checkin;

import com.footlog.api.auth.CurrentUserProvider;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

@RestController
public class CheckInController {

  private final CheckInRepository checkInRepository;
  private final CurrentUserProvider currentUserProvider;

  public CheckInController(CheckInRepository checkInRepository, CurrentUserProvider currentUserProvider) {
    this.checkInRepository = checkInRepository;
    this.currentUserProvider = currentUserProvider;
  }

  @PutMapping("/v1/check-ins/{id}")
  public CheckInResponse put(@PathVariable UUID id, @RequestBody CheckInRequest request) {
    UUID userId = currentUserProvider.currentUserId();
    CheckIn candidate = new CheckIn(id, userId, request.latitude(), request.longitude(), request.accuracyM(),
        request.capturedAt(), request.checkedInAt(), request.createdAt(), null);
    CheckIn saved = checkInRepository.upsert(candidate);
    return CheckInResponse.from(saved);
  }
}
```

- [ ] **Step 4: 테스트 실행해서 통과 확인**

Run: `cd backend && JAVA_HOME=$(/usr/libexec/java_home -v 21) ./gradlew test --tests "com.footlog.api.checkin.CheckInControllerTest"`
Expected: `BUILD SUCCESSFUL`, 2개 테스트 통과

- [ ] **Step 5: 커밋**

```bash
cd backend
git add src/main/java/com/footlog/api/checkin src/test/java/com/footlog/api/checkin/CheckInControllerTest.java
git commit -m "feat(check-in): 체크인 생성 API(PUT) 추가"
```

---

### Task 6: check_in_notes 테이블과 리포지토리

**Files:**
- Create: `backend/src/main/resources/db/migration/V4__create_check_in_notes.sql`
- Create: `backend/src/main/java/com/footlog/api/checkinnote/CheckInNote.java`
- Create: `backend/src/main/java/com/footlog/api/checkinnote/CheckInNoteRepository.java`
- Test: `backend/src/test/java/com/footlog/api/checkinnote/CheckInNoteRepositoryTest.java`

**Interfaces:**
- Consumes: `CheckInRepository.findById`(Task 4), `SyncChangeLogRepository.append`(Task 3), `ApiException`(Task 1)
- Produces: `CheckInNote` record(`id, checkInId, body, updatedAt, deletedAt`). `CheckInNoteRepository.upsert(UUID userId, UUID id, UUID checkInId, String body, Instant updatedAt): CheckInNote`, `.delete(UUID userId, UUID id, Instant deletedAt): void`, `.findActiveByCheckInId(UUID checkInId): Optional<CheckInNote>` — Task 12(연쇄 삭제)가 `findActiveByCheckInId`와 `delete`를 사용.

- [ ] **Step 1: 마이그레이션 작성**

```sql
-- backend/src/main/resources/db/migration/V4__create_check_in_notes.sql
CREATE TABLE IF NOT EXISTS check_in_notes (
  id UUID PRIMARY KEY,
  check_in_id UUID NOT NULL UNIQUE REFERENCES check_ins(id),
  body TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  deleted_at TIMESTAMPTZ
);
```

- [ ] **Step 2: 실패하는 테스트 작성**

```java
package com.footlog.api.checkinnote;

import com.footlog.api.checkin.CheckIn;
import com.footlog.api.checkin.CheckInRepository;
import com.footlog.api.common.ApiException;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;

import java.time.Instant;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@SpringBootTest
@Testcontainers
class CheckInNoteRepositoryTest {

  @Container
  static final PostgreSQLContainer<?> postgres =
      new PostgreSQLContainer<>(DockerImageName.parse("postgis/postgis:17-3.5")
          .asCompatibleSubstituteFor("postgres"));

  @DynamicPropertySource
  static void registerDataSourceProperties(DynamicPropertyRegistry registry) {
    registry.add("spring.datasource.url", postgres::getJdbcUrl);
    registry.add("spring.datasource.username", postgres::getUsername);
    registry.add("spring.datasource.password", postgres::getPassword);
  }

  @Autowired CheckInNoteRepository checkInNoteRepository;
  @Autowired CheckInRepository checkInRepository;

  private UUID createCheckIn(UUID userId) {
    UUID id = UUID.randomUUID();
    Instant now = Instant.parse("2026-08-16T09:00:00Z");
    checkInRepository.upsert(new CheckIn(id, userId, 37.5, 127.0, 15.0, now, now, now, null));
    return id;
  }

  @Test
  void createsNoteForOwnedCheckIn() {
    UUID userId = UUID.randomUUID();
    UUID checkInId = createCheckIn(userId);
    UUID noteId = UUID.randomUUID();
    Instant now = Instant.parse("2026-08-16T09:05:00Z");

    CheckInNote saved = checkInNoteRepository.upsert(userId, noteId, checkInId, "좋은 카페", now);

    assertThat(saved.body()).isEqualTo("좋은 카페");
    assertThat(checkInNoteRepository.findActiveByCheckInId(checkInId)).contains(saved);
  }

  @Test
  void staleUpdateIsIgnored() {
    UUID userId = UUID.randomUUID();
    UUID checkInId = createCheckIn(userId);
    UUID noteId = UUID.randomUUID();
    Instant first = Instant.parse("2026-08-16T09:05:00Z");
    Instant stale = Instant.parse("2026-08-16T09:00:00Z");
    checkInNoteRepository.upsert(userId, noteId, checkInId, "첫 메모", first);

    CheckInNote result = checkInNoteRepository.upsert(userId, noteId, checkInId, "오래된 메모", stale);

    assertThat(result.body()).isEqualTo("첫 메모");
  }

  @Test
  void rejectsNoteForDeletedCheckIn() {
    UUID userId = UUID.randomUUID();
    UUID checkInId = createCheckIn(userId);
    checkInRepository.softDelete(userId, checkInId, Instant.parse("2026-08-16T09:10:00Z"));

    assertThatThrownBy(() ->
        checkInNoteRepository.upsert(userId, UUID.randomUUID(), checkInId, "메모", Instant.now()))
        .isInstanceOf(ApiException.class);
  }

  @Test
  void deleteIsIdempotent() {
    UUID userId = UUID.randomUUID();
    UUID checkInId = createCheckIn(userId);
    UUID noteId = UUID.randomUUID();
    checkInNoteRepository.upsert(userId, noteId, checkInId, "메모", Instant.parse("2026-08-16T09:05:00Z"));

    checkInNoteRepository.delete(userId, noteId, Instant.parse("2026-08-16T09:10:00Z"));
    checkInNoteRepository.delete(userId, noteId, Instant.parse("2026-08-16T09:10:00Z"));

    assertThat(checkInNoteRepository.findActiveByCheckInId(checkInId)).isEmpty();
  }
}
```

- [ ] **Step 3: 테스트 실행해서 실패 확인**

Run: `cd backend && JAVA_HOME=$(/usr/libexec/java_home -v 21) ./gradlew test --tests "com.footlog.api.checkinnote.CheckInNoteRepositoryTest"`
Expected: 컴파일 실패 (`CheckInNote`, `CheckInNoteRepository`가 아직 없음)

- [ ] **Step 4: 최소 구현 작성**

```java
package com.footlog.api.checkinnote;

import java.time.Instant;
import java.util.UUID;

public record CheckInNote(UUID id, UUID checkInId, String body, Instant updatedAt, Instant deletedAt) {}
```

```java
package com.footlog.api.checkinnote;

import com.footlog.api.checkin.CheckIn;
import com.footlog.api.checkin.CheckInRepository;
import com.footlog.api.common.ApiException;
import com.footlog.api.sync.SyncChangeLogRepository;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public class CheckInNoteRepository {

  private static final RowMapper<CheckInNote> ROW_MAPPER = (rs, rowNum) -> new CheckInNote(
      UUID.fromString(rs.getString("id")),
      UUID.fromString(rs.getString("check_in_id")),
      rs.getString("body"),
      rs.getTimestamp("updated_at").toInstant(),
      rs.getTimestamp("deleted_at") == null ? null : rs.getTimestamp("deleted_at").toInstant());

  private final JdbcTemplate jdbcTemplate;
  private final CheckInRepository checkInRepository;
  private final SyncChangeLogRepository syncChangeLogRepository;

  public CheckInNoteRepository(JdbcTemplate jdbcTemplate, CheckInRepository checkInRepository,
                                SyncChangeLogRepository syncChangeLogRepository) {
    this.jdbcTemplate = jdbcTemplate;
    this.checkInRepository = checkInRepository;
    this.syncChangeLogRepository = syncChangeLogRepository;
  }

  public Optional<CheckInNote> findActiveByCheckInId(UUID checkInId) {
    List<CheckInNote> rows = jdbcTemplate.query(
        "SELECT * FROM check_in_notes WHERE check_in_id = ? AND deleted_at IS NULL", ROW_MAPPER, checkInId);
    return rows.stream().findFirst();
  }

  private Optional<CheckInNote> findOwned(UUID userId, UUID noteId) {
    List<CheckInNote> rows = jdbcTemplate.query(
        "SELECT n.* FROM check_in_notes n JOIN check_ins c ON c.id = n.check_in_id " +
            "WHERE n.id = ? AND c.user_id = ?",
        ROW_MAPPER, noteId, userId);
    return rows.stream().findFirst();
  }

  @Transactional
  public CheckInNote upsert(UUID userId, UUID id, UUID checkInId, String body, Instant updatedAt) {
    requireOwnedActiveCheckIn(userId, checkInId);

    Optional<CheckInNote> existing = findOwned(userId, id);
    if (existing.isEmpty()) {
      jdbcTemplate.update(
          "INSERT INTO check_in_notes (id, check_in_id, body, updated_at) VALUES (?, ?, ?, ?)",
          id, checkInId, body, Timestamp.from(updatedAt));
      CheckInNote saved = new CheckInNote(id, checkInId, body, updatedAt, null);
      syncChangeLogRepository.append(userId, "check_in_note", id, "create", saved, updatedAt);
      return saved;
    }

    CheckInNote current = existing.get();
    if (!updatedAt.isAfter(current.updatedAt())) {
      return current;
    }
    jdbcTemplate.update("UPDATE check_in_notes SET body = ?, updated_at = ? WHERE id = ?",
        body, Timestamp.from(updatedAt), id);
    CheckInNote saved = new CheckInNote(id, checkInId, body, updatedAt, null);
    syncChangeLogRepository.append(userId, "check_in_note", id, "update", saved, updatedAt);
    return saved;
  }

  @Transactional
  public void delete(UUID userId, UUID id, Instant deletedAt) {
    Optional<CheckInNote> existing = findOwned(userId, id);
    if (existing.isEmpty() || existing.get().deletedAt() != null) {
      return;
    }
    jdbcTemplate.update("UPDATE check_in_notes SET deleted_at = ? WHERE id = ?", Timestamp.from(deletedAt), id);
    syncChangeLogRepository.append(userId, "check_in_note", id, "delete", null, deletedAt);
  }

  private CheckIn requireOwnedActiveCheckIn(UUID userId, UUID checkInId) {
    CheckIn checkIn = checkInRepository.findById(checkInId)
        .filter(c -> c.userId().equals(userId))
        .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "CHECK_IN_NOT_FOUND", "체크인을 찾을 수 없습니다"));
    if (checkIn.deletedAt() != null) {
      throw new ApiException(HttpStatus.CONFLICT, "CHECK_IN_DELETED", "삭제된 체크인에는 메모를 추가할 수 없습니다");
    }
    return checkIn;
  }
}
```

- [ ] **Step 5: 테스트 실행해서 통과 확인**

Run: `cd backend && JAVA_HOME=$(/usr/libexec/java_home -v 21) ./gradlew test --tests "com.footlog.api.checkinnote.CheckInNoteRepositoryTest"`
Expected: `BUILD SUCCESSFUL`, 4개 테스트 통과

- [ ] **Step 6: 커밋**

```bash
cd backend
git add src/main/resources/db/migration/V4__create_check_in_notes.sql src/main/java/com/footlog/api/checkinnote src/test/java/com/footlog/api/checkinnote
git commit -m "feat(check-in-note): check_in_notes 테이블과 리포지토리 추가"
```

---

### Task 7: 메모 API (PUT/DELETE)

**Files:**
- Create: `backend/src/main/java/com/footlog/api/checkinnote/CheckInNoteRequest.java`
- Create: `backend/src/main/java/com/footlog/api/checkinnote/CheckInNoteResponse.java`
- Create: `backend/src/main/java/com/footlog/api/checkinnote/CheckInNoteController.java`
- Test: `backend/src/test/java/com/footlog/api/checkinnote/CheckInNoteControllerTest.java`

**Interfaces:**
- Consumes: `CheckInNoteRepository`(Task 6), `CurrentUserProvider`(Task 2), `DeletedAtRequest`(Task 1)
- Produces: `PUT /v1/check-in-notes/{id}`, `DELETE /v1/check-in-notes/{id}`

- [ ] **Step 1: 실패하는 테스트 작성**

```java
package com.footlog.api.checkinnote;

import com.footlog.api.checkin.CheckIn;
import com.footlog.api.checkin.CheckInRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;

import java.time.Instant;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@Testcontainers
class CheckInNoteControllerTest {

  @Container
  static final PostgreSQLContainer<?> postgres =
      new PostgreSQLContainer<>(DockerImageName.parse("postgis/postgis:17-3.5")
          .asCompatibleSubstituteFor("postgres"));

  @DynamicPropertySource
  static void registerDataSourceProperties(DynamicPropertyRegistry registry) {
    registry.add("spring.datasource.url", postgres::getJdbcUrl);
    registry.add("spring.datasource.username", postgres::getUsername);
    registry.add("spring.datasource.password", postgres::getPassword);
  }

  @Autowired TestRestTemplate restTemplate;
  @Autowired CheckInRepository checkInRepository;

  private HttpHeaders headersFor(UUID userId) {
    HttpHeaders headers = new HttpHeaders();
    headers.set("X-Debug-User-Id", userId.toString());
    headers.set("Content-Type", "application/json");
    return headers;
  }

  private UUID createCheckIn(UUID userId) {
    UUID id = UUID.randomUUID();
    Instant now = Instant.parse("2026-08-16T09:00:00Z");
    checkInRepository.upsert(new CheckIn(id, userId, 37.5, 127.0, 15.0, now, now, now, null));
    return id;
  }

  @Test
  void putThenDeleteNote() {
    UUID userId = UUID.randomUUID();
    UUID checkInId = createCheckIn(userId);
    UUID noteId = UUID.randomUUID();
    Map<String, Object> body = Map.of("checkInId", checkInId, "body", "좋은 카페", "updatedAt", "2026-08-16T09:05:00Z");

    var putResponse = restTemplate.exchange(
        "/v1/check-in-notes/" + noteId, HttpMethod.PUT, new HttpEntity<>(body, headersFor(userId)), CheckInNoteResponse.class);
    assertThat(putResponse.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(putResponse.getBody().body()).isEqualTo("좋은 카페");

    var deleteResponse = restTemplate.exchange(
        "/v1/check-in-notes/" + noteId, HttpMethod.DELETE,
        new HttpEntity<>(Map.of("deletedAt", "2026-08-16T09:10:00Z"), headersFor(userId)), Void.class);
    assertThat(deleteResponse.getStatusCode()).isEqualTo(HttpStatus.OK);
  }

  @Test
  void noteForMissingCheckInReturns404() {
    UUID userId = UUID.randomUUID();
    Map<String, Object> body = Map.of(
        "checkInId", UUID.randomUUID(), "body", "메모", "updatedAt", "2026-08-16T09:05:00Z");

    var response = restTemplate.exchange(
        "/v1/check-in-notes/" + UUID.randomUUID(), HttpMethod.PUT, new HttpEntity<>(body, headersFor(userId)), String.class);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
  }
}
```

- [ ] **Step 2: 테스트 실행해서 실패 확인**

Run: `cd backend && JAVA_HOME=$(/usr/libexec/java_home -v 21) ./gradlew test --tests "com.footlog.api.checkinnote.CheckInNoteControllerTest"`
Expected: 컴파일 실패 (`CheckInNoteRequest`, `CheckInNoteResponse`, `CheckInNoteController`가 아직 없음)

- [ ] **Step 3: 최소 구현 작성**

```java
package com.footlog.api.checkinnote;

import java.time.Instant;
import java.util.UUID;

public record CheckInNoteRequest(UUID checkInId, String body, Instant updatedAt) {}
```

```java
package com.footlog.api.checkinnote;

import java.time.Instant;
import java.util.UUID;

public record CheckInNoteResponse(UUID id, UUID checkInId, String body, Instant updatedAt, Instant deletedAt) {

  static CheckInNoteResponse from(CheckInNote note) {
    return new CheckInNoteResponse(note.id(), note.checkInId(), note.body(), note.updatedAt(), note.deletedAt());
  }
}
```

```java
package com.footlog.api.checkinnote;

import com.footlog.api.auth.CurrentUserProvider;
import com.footlog.api.common.DeletedAtRequest;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

@RestController
public class CheckInNoteController {

  private final CheckInNoteRepository checkInNoteRepository;
  private final CurrentUserProvider currentUserProvider;

  public CheckInNoteController(CheckInNoteRepository checkInNoteRepository, CurrentUserProvider currentUserProvider) {
    this.checkInNoteRepository = checkInNoteRepository;
    this.currentUserProvider = currentUserProvider;
  }

  @PutMapping("/v1/check-in-notes/{id}")
  public CheckInNoteResponse put(@PathVariable UUID id, @RequestBody CheckInNoteRequest request) {
    UUID userId = currentUserProvider.currentUserId();
    CheckInNote saved = checkInNoteRepository.upsert(userId, id, request.checkInId(), request.body(), request.updatedAt());
    return CheckInNoteResponse.from(saved);
  }

  @DeleteMapping("/v1/check-in-notes/{id}")
  public void delete(@PathVariable UUID id, @RequestBody DeletedAtRequest request) {
    UUID userId = currentUserProvider.currentUserId();
    checkInNoteRepository.delete(userId, id, request.deletedAt());
  }
}
```

- [ ] **Step 4: 테스트 실행해서 통과 확인**

Run: `cd backend && JAVA_HOME=$(/usr/libexec/java_home -v 21) ./gradlew test --tests "com.footlog.api.checkinnote.CheckInNoteControllerTest"`
Expected: `BUILD SUCCESSFUL`, 2개 테스트 통과

- [ ] **Step 5: 커밋**

```bash
cd backend
git add src/main/java/com/footlog/api/checkinnote/CheckInNoteRequest.java src/main/java/com/footlog/api/checkinnote/CheckInNoteResponse.java src/main/java/com/footlog/api/checkinnote/CheckInNoteController.java src/test/java/com/footlog/api/checkinnote/CheckInNoteControllerTest.java
git commit -m "feat(check-in-note): 메모 생성/삭제 API 추가"
```

---

### Task 8: daily_reflections 테이블과 리포지토리

**Files:**
- Create: `backend/src/main/resources/db/migration/V5__create_daily_reflections.sql`
- Create: `backend/src/main/java/com/footlog/api/dailyreflection/DailyReflection.java`
- Create: `backend/src/main/java/com/footlog/api/dailyreflection/DailyReflectionRepository.java`
- Test: `backend/src/test/java/com/footlog/api/dailyreflection/DailyReflectionRepositoryTest.java`

**Interfaces:**
- Consumes: `SyncChangeLogRepository.append`(Task 3), `ApiException`(Task 1)
- Produces: `DailyReflection` record(`id, userId, date, body, updatedAt, deletedAt`). `DailyReflectionRepository.upsert(UUID userId, UUID id, LocalDate date, String body, Instant updatedAt): DailyReflection`, `.delete(UUID userId, UUID id, Instant deletedAt): void`

- [ ] **Step 1: 마이그레이션 작성**

```sql
-- backend/src/main/resources/db/migration/V5__create_daily_reflections.sql
CREATE TABLE IF NOT EXISTS daily_reflections (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL,
  date DATE NOT NULL,
  body TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  deleted_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_daily_reflections_user_date_active
  ON daily_reflections(user_id, date) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_daily_reflections_user_date
  ON daily_reflections(user_id, date);
```

- [ ] **Step 2: 실패하는 테스트 작성**

```java
package com.footlog.api.dailyreflection;

import com.footlog.api.common.ApiException;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;

import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@SpringBootTest
@Testcontainers
class DailyReflectionRepositoryTest {

  @Container
  static final PostgreSQLContainer<?> postgres =
      new PostgreSQLContainer<>(DockerImageName.parse("postgis/postgis:17-3.5")
          .asCompatibleSubstituteFor("postgres"));

  @DynamicPropertySource
  static void registerDataSourceProperties(DynamicPropertyRegistry registry) {
    registry.add("spring.datasource.url", postgres::getJdbcUrl);
    registry.add("spring.datasource.username", postgres::getUsername);
    registry.add("spring.datasource.password", postgres::getPassword);
  }

  @Autowired DailyReflectionRepository repository;

  @Test
  void createsReflectionForDate() {
    UUID userId = UUID.randomUUID();
    UUID id = UUID.randomUUID();
    LocalDate date = LocalDate.of(2026, 8, 16);

    DailyReflection saved = repository.upsert(userId, id, date, "오늘은 걸었다", Instant.parse("2026-08-16T21:00:00Z"));

    assertThat(saved.body()).isEqualTo("오늘은 걸었다");
  }

  @Test
  void rejectsSecondActiveReflectionForSameDate() {
    UUID userId = UUID.randomUUID();
    LocalDate date = LocalDate.of(2026, 8, 16);
    repository.upsert(userId, UUID.randomUUID(), date, "첫 회고", Instant.parse("2026-08-16T21:00:00Z"));

    assertThatThrownBy(() ->
        repository.upsert(userId, UUID.randomUUID(), date, "두번째 회고", Instant.parse("2026-08-16T21:05:00Z")))
        .isInstanceOf(ApiException.class);
  }

  @Test
  void allowsRecreatingReflectionAfterDelete() {
    UUID userId = UUID.randomUUID();
    UUID firstId = UUID.randomUUID();
    LocalDate date = LocalDate.of(2026, 8, 16);
    repository.upsert(userId, firstId, date, "첫 회고", Instant.parse("2026-08-16T21:00:00Z"));
    repository.delete(userId, firstId, Instant.parse("2026-08-16T21:10:00Z"));

    DailyReflection recreated = repository.upsert(
        userId, UUID.randomUUID(), date, "다시 쓴 회고", Instant.parse("2026-08-16T21:15:00Z"));

    assertThat(recreated.body()).isEqualTo("다시 쓴 회고");
  }

  @Test
  void staleUpdateIsIgnored() {
    UUID userId = UUID.randomUUID();
    UUID id = UUID.randomUUID();
    LocalDate date = LocalDate.of(2026, 8, 16);
    repository.upsert(userId, id, date, "최신 내용", Instant.parse("2026-08-16T21:10:00Z"));

    DailyReflection result = repository.upsert(userId, id, date, "오래된 내용", Instant.parse("2026-08-16T21:00:00Z"));

    assertThat(result.body()).isEqualTo("최신 내용");
  }

  @Test
  void deleteIsIdempotent() {
    UUID userId = UUID.randomUUID();
    UUID id = UUID.randomUUID();
    LocalDate date = LocalDate.of(2026, 8, 16);
    repository.upsert(userId, id, date, "오늘은 걸었다", Instant.parse("2026-08-16T21:00:00Z"));

    repository.delete(userId, id, Instant.parse("2026-08-16T21:30:00Z"));
    repository.delete(userId, id, Instant.parse("2026-08-16T21:30:00Z"));

    assertThat(repository.findOwned(userId, id).orElseThrow().deletedAt()).isNotNull();
  }
}
```

- [ ] **Step 3: 테스트 실행해서 실패 확인**

Run: `cd backend && JAVA_HOME=$(/usr/libexec/java_home -v 21) ./gradlew test --tests "com.footlog.api.dailyreflection.DailyReflectionRepositoryTest"`
Expected: 컴파일 실패 (`DailyReflection`, `DailyReflectionRepository`가 아직 없음)

- [ ] **Step 4: 최소 구현 작성**

```java
package com.footlog.api.dailyreflection;

import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

public record DailyReflection(UUID id, UUID userId, LocalDate date, String body, Instant updatedAt, Instant deletedAt) {}
```

```java
package com.footlog.api.dailyreflection;

import com.footlog.api.common.ApiException;
import com.footlog.api.sync.SyncChangeLogRepository;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import java.sql.Date;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public class DailyReflectionRepository {

  private static final RowMapper<DailyReflection> ROW_MAPPER = (rs, rowNum) -> new DailyReflection(
      UUID.fromString(rs.getString("id")),
      UUID.fromString(rs.getString("user_id")),
      rs.getDate("date").toLocalDate(),
      rs.getString("body"),
      rs.getTimestamp("updated_at").toInstant(),
      rs.getTimestamp("deleted_at") == null ? null : rs.getTimestamp("deleted_at").toInstant());

  private final JdbcTemplate jdbcTemplate;
  private final SyncChangeLogRepository syncChangeLogRepository;

  public DailyReflectionRepository(JdbcTemplate jdbcTemplate, SyncChangeLogRepository syncChangeLogRepository) {
    this.jdbcTemplate = jdbcTemplate;
    this.syncChangeLogRepository = syncChangeLogRepository;
  }

  public Optional<DailyReflection> findOwned(UUID userId, UUID id) {
    List<DailyReflection> rows = jdbcTemplate.query(
        "SELECT * FROM daily_reflections WHERE id = ? AND user_id = ?", ROW_MAPPER, id, userId);
    return rows.stream().findFirst();
  }

  @Transactional
  public DailyReflection upsert(UUID userId, UUID id, LocalDate date, String body, Instant updatedAt) {
    Optional<DailyReflection> existing = findOwned(userId, id);

    if (existing.isPresent() && !updatedAt.isAfter(existing.get().updatedAt())) {
      return existing.get();
    }

    assertDateAvailable(userId, date, id);

    if (existing.isEmpty()) {
      jdbcTemplate.update(
          "INSERT INTO daily_reflections (id, user_id, date, body, updated_at) VALUES (?, ?, ?, ?, ?)",
          id, userId, Date.valueOf(date), body, Timestamp.from(updatedAt));
      DailyReflection saved = new DailyReflection(id, userId, date, body, updatedAt, null);
      syncChangeLogRepository.append(userId, "daily_reflection", id, "create", saved, updatedAt);
      return saved;
    }

    jdbcTemplate.update("UPDATE daily_reflections SET date = ?, body = ?, updated_at = ? WHERE id = ?",
        Date.valueOf(date), body, Timestamp.from(updatedAt), id);
    DailyReflection saved = new DailyReflection(id, userId, date, body, updatedAt, null);
    syncChangeLogRepository.append(userId, "daily_reflection", id, "update", saved, updatedAt);
    return saved;
  }

  @Transactional
  public void delete(UUID userId, UUID id, Instant deletedAt) {
    Optional<DailyReflection> existing = findOwned(userId, id);
    if (existing.isEmpty() || existing.get().deletedAt() != null) {
      return;
    }
    jdbcTemplate.update("UPDATE daily_reflections SET deleted_at = ? WHERE id = ?", Timestamp.from(deletedAt), id);
    syncChangeLogRepository.append(userId, "daily_reflection", id, "delete", null, deletedAt);
  }

  private void assertDateAvailable(UUID userId, LocalDate date, UUID excludingId) {
    List<UUID> conflicting = jdbcTemplate.query(
        "SELECT id FROM daily_reflections WHERE user_id = ? AND date = ? AND deleted_at IS NULL AND id <> ?",
        (rs, rowNum) -> UUID.fromString(rs.getString("id")),
        userId, Date.valueOf(date), excludingId);
    if (!conflicting.isEmpty()) {
      throw new ApiException(HttpStatus.CONFLICT, "REFLECTION_DATE_CONFLICT", "해당 날짜에 이미 다른 회고가 있습니다");
    }
  }
}
```

- [ ] **Step 5: 테스트 실행해서 통과 확인**

Run: `cd backend && JAVA_HOME=$(/usr/libexec/java_home -v 21) ./gradlew test --tests "com.footlog.api.dailyreflection.DailyReflectionRepositoryTest"`
Expected: `BUILD SUCCESSFUL`, 5개 테스트 통과

- [ ] **Step 6: 커밋**

```bash
cd backend
git add src/main/resources/db/migration/V5__create_daily_reflections.sql src/main/java/com/footlog/api/dailyreflection src/test/java/com/footlog/api/dailyreflection
git commit -m "feat(daily-reflection): daily_reflections 테이블과 리포지토리 추가"
```

---

### Task 9: 회고 API (PUT/DELETE)

**Files:**
- Create: `backend/src/main/java/com/footlog/api/dailyreflection/DailyReflectionRequest.java`
- Create: `backend/src/main/java/com/footlog/api/dailyreflection/DailyReflectionResponse.java`
- Create: `backend/src/main/java/com/footlog/api/dailyreflection/DailyReflectionController.java`
- Test: `backend/src/test/java/com/footlog/api/dailyreflection/DailyReflectionControllerTest.java`

**Interfaces:**
- Consumes: `DailyReflectionRepository`(Task 8), `CurrentUserProvider`(Task 2), `DeletedAtRequest`(Task 1)
- Produces: `PUT /v1/daily-reflections/{id}`, `DELETE /v1/daily-reflections/{id}`

- [ ] **Step 1: 실패하는 테스트 작성**

```java
package com.footlog.api.dailyreflection;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;

import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@Testcontainers
class DailyReflectionControllerTest {

  @Container
  static final PostgreSQLContainer<?> postgres =
      new PostgreSQLContainer<>(DockerImageName.parse("postgis/postgis:17-3.5")
          .asCompatibleSubstituteFor("postgres"));

  @DynamicPropertySource
  static void registerDataSourceProperties(DynamicPropertyRegistry registry) {
    registry.add("spring.datasource.url", postgres::getJdbcUrl);
    registry.add("spring.datasource.username", postgres::getUsername);
    registry.add("spring.datasource.password", postgres::getPassword);
  }

  @Autowired TestRestTemplate restTemplate;

  private HttpHeaders headersFor(UUID userId) {
    HttpHeaders headers = new HttpHeaders();
    headers.set("X-Debug-User-Id", userId.toString());
    headers.set("Content-Type", "application/json");
    return headers;
  }

  @Test
  void putThenDeleteReflection() {
    UUID userId = UUID.randomUUID();
    UUID id = UUID.randomUUID();
    Map<String, Object> body = Map.of("date", "2026-08-16", "body", "오늘은 걸었다", "updatedAt", "2026-08-16T21:00:00Z");

    var putResponse = restTemplate.exchange(
        "/v1/daily-reflections/" + id, HttpMethod.PUT, new HttpEntity<>(body, headersFor(userId)), DailyReflectionResponse.class);
    assertThat(putResponse.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(putResponse.getBody().body()).isEqualTo("오늘은 걸었다");

    var deleteResponse = restTemplate.exchange(
        "/v1/daily-reflections/" + id, HttpMethod.DELETE,
        new HttpEntity<>(Map.of("deletedAt", "2026-08-16T21:10:00Z"), headersFor(userId)), Void.class);
    assertThat(deleteResponse.getStatusCode()).isEqualTo(HttpStatus.OK);
  }

  @Test
  void conflictingDateReturns409() {
    UUID userId = UUID.randomUUID();
    Map<String, Object> firstBody = Map.of("date", "2026-08-16", "body", "첫 회고", "updatedAt", "2026-08-16T21:00:00Z");
    restTemplate.exchange("/v1/daily-reflections/" + UUID.randomUUID(), HttpMethod.PUT,
        new HttpEntity<>(firstBody, headersFor(userId)), DailyReflectionResponse.class);

    Map<String, Object> secondBody = Map.of("date", "2026-08-16", "body", "두번째 회고", "updatedAt", "2026-08-16T21:05:00Z");
    var response = restTemplate.exchange("/v1/daily-reflections/" + UUID.randomUUID(), HttpMethod.PUT,
        new HttpEntity<>(secondBody, headersFor(userId)), String.class);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.CONFLICT);
  }
}
```

- [ ] **Step 2: 테스트 실행해서 실패 확인**

Run: `cd backend && JAVA_HOME=$(/usr/libexec/java_home -v 21) ./gradlew test --tests "com.footlog.api.dailyreflection.DailyReflectionControllerTest"`
Expected: 컴파일 실패 (`DailyReflectionRequest`, `DailyReflectionResponse`, `DailyReflectionController`가 아직 없음)

- [ ] **Step 3: 최소 구현 작성**

```java
package com.footlog.api.dailyreflection;

import java.time.Instant;
import java.time.LocalDate;

public record DailyReflectionRequest(LocalDate date, String body, Instant updatedAt) {}
```

```java
package com.footlog.api.dailyreflection;

import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

public record DailyReflectionResponse(UUID id, LocalDate date, String body, Instant updatedAt, Instant deletedAt) {

  static DailyReflectionResponse from(DailyReflection reflection) {
    return new DailyReflectionResponse(reflection.id(), reflection.date(), reflection.body(),
        reflection.updatedAt(), reflection.deletedAt());
  }
}
```

```java
package com.footlog.api.dailyreflection;

import com.footlog.api.auth.CurrentUserProvider;
import com.footlog.api.common.DeletedAtRequest;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

@RestController
public class DailyReflectionController {

  private final DailyReflectionRepository dailyReflectionRepository;
  private final CurrentUserProvider currentUserProvider;

  public DailyReflectionController(DailyReflectionRepository dailyReflectionRepository,
                                    CurrentUserProvider currentUserProvider) {
    this.dailyReflectionRepository = dailyReflectionRepository;
    this.currentUserProvider = currentUserProvider;
  }

  @PutMapping("/v1/daily-reflections/{id}")
  public DailyReflectionResponse put(@PathVariable UUID id, @RequestBody DailyReflectionRequest request) {
    UUID userId = currentUserProvider.currentUserId();
    DailyReflection saved = dailyReflectionRepository.upsert(userId, id, request.date(), request.body(), request.updatedAt());
    return DailyReflectionResponse.from(saved);
  }

  @DeleteMapping("/v1/daily-reflections/{id}")
  public void delete(@PathVariable UUID id, @RequestBody DeletedAtRequest request) {
    UUID userId = currentUserProvider.currentUserId();
    dailyReflectionRepository.delete(userId, id, request.deletedAt());
  }
}
```

- [ ] **Step 4: 테스트 실행해서 통과 확인**

Run: `cd backend && JAVA_HOME=$(/usr/libexec/java_home -v 21) ./gradlew test --tests "com.footlog.api.dailyreflection.DailyReflectionControllerTest"`
Expected: `BUILD SUCCESSFUL`, 2개 테스트 통과

- [ ] **Step 5: 커밋**

```bash
cd backend
git add src/main/java/com/footlog/api/dailyreflection/DailyReflectionRequest.java src/main/java/com/footlog/api/dailyreflection/DailyReflectionResponse.java src/main/java/com/footlog/api/dailyreflection/DailyReflectionController.java src/test/java/com/footlog/api/dailyreflection/DailyReflectionControllerTest.java
git commit -m "feat(daily-reflection): 회고 생성/삭제 API 추가"
```

---

### Task 10: photo_attachments 테이블, 스토리지 클라이언트, 리포지토리

**Files:**
- Create: `backend/src/main/resources/db/migration/V6__create_photo_attachments.sql`
- Create: `backend/src/main/java/com/footlog/api/photo/ObjectStorageClient.java`
- Create: `backend/src/main/java/com/footlog/api/photo/StubObjectStorageClient.java`
- Test: `backend/src/test/java/com/footlog/api/photo/StubObjectStorageClientTest.java`
- Create: `backend/src/main/java/com/footlog/api/photo/PhotoAttachment.java`
- Create: `backend/src/main/java/com/footlog/api/photo/PhotoAttachmentRepository.java`
- Test: `backend/src/test/java/com/footlog/api/photo/PhotoAttachmentRepositoryTest.java`

**Interfaces:**
- Consumes: `CheckInRepository.findById`(Task 4), `SyncChangeLogRepository.append`(Task 3), `ApiException`(Task 1)
- Produces: `ObjectStorageClient.issueUploadUrl/verifyUploaded/delete` 인터페이스 — 실제 객체 스토리지 연동 전까지 `StubObjectStorageClient`가 유일한 구현체이며, 연동 설계가 나오면 이 구현체만 교체한다. `PhotoAttachmentRepository.createUploading/complete/delete/findOwned/findAllActiveByCheckInId` — Task 12(연쇄 삭제)가 `findAllActiveByCheckInId`와 `delete`를 사용.

- [ ] **Step 1: 마이그레이션 작성**

```sql
-- backend/src/main/resources/db/migration/V6__create_photo_attachments.sql
CREATE TABLE IF NOT EXISTS photo_attachments (
  id UUID PRIMARY KEY,
  check_in_id UUID NOT NULL REFERENCES check_ins(id),
  object_key TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size_bytes BIGINT NOT NULL CHECK (size_bytes > 0),
  checksum TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'uploading' CHECK (status IN ('uploading','ready','deleted')),
  created_at TIMESTAMPTZ NOT NULL,
  ready_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ
);

-- 교체 흐름 중에는 기존 ready 사진과 신규 uploading 사진이 일시적으로 공존해야 하므로
-- check_in_id 자체는 UNIQUE로 강제하지 않고, "활성 ready는 1장"만 부분 인덱스로 강제한다.
CREATE UNIQUE INDEX IF NOT EXISTS uq_photo_attachments_ready_per_check_in
  ON photo_attachments(check_in_id) WHERE status = 'ready' AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_photo_attachments_uploading
  ON photo_attachments(status, created_at) WHERE status = 'uploading';
```

- [ ] **Step 2: ObjectStorageClient 실패하는 테스트 작성**

```java
package com.footlog.api.photo;

import org.junit.jupiter.api.Test;

import java.time.Instant;

import static org.assertj.core.api.Assertions.assertThat;

class StubObjectStorageClientTest {

  private final StubObjectStorageClient client = new StubObjectStorageClient();

  @Test
  void issuesUploadUrlWithFutureExpiry() {
    ObjectStorageClient.PresignedUpload upload = client.issueUploadUrl("photos/a/b", "image/jpeg", 1024L);

    assertThat(upload.uploadUrl()).contains("photos/a/b");
    assertThat(upload.expiresAt()).isAfter(Instant.now());
  }

  @Test
  void verifyUploadedAlwaysSucceedsForStub() {
    assertThat(client.verifyUploaded("photos/a/b", 1024L, "checksum")).isTrue();
  }
}
```

- [ ] **Step 3: 테스트 실행해서 실패 확인**

Run: `cd backend && JAVA_HOME=$(/usr/libexec/java_home -v 21) ./gradlew test --tests "com.footlog.api.photo.StubObjectStorageClientTest"`
Expected: 컴파일 실패 (`ObjectStorageClient`, `StubObjectStorageClient`가 아직 없음)

- [ ] **Step 4: ObjectStorageClient 최소 구현 작성**

```java
package com.footlog.api.photo;

import java.time.Instant;

public interface ObjectStorageClient {

  PresignedUpload issueUploadUrl(String objectKey, String contentType, long sizeBytes);

  boolean verifyUploaded(String objectKey, long expectedSizeBytes, String expectedChecksum);

  void delete(String objectKey);

  record PresignedUpload(String uploadUrl, Instant expiresAt) {}
}
```

```java
package com.footlog.api.photo;

import org.springframework.stereotype.Component;

import java.time.Instant;
import java.time.temporal.ChronoUnit;

/**
 * 실제 객체 스토리지 연동(사전 서명 URL 발급) 전까지 사용하는 스텁.
 * 검증은 항상 성공한다고 가정하고, 삭제는 아무 동작도 하지 않는다.
 */
@Component
public class StubObjectStorageClient implements ObjectStorageClient {

  @Override
  public PresignedUpload issueUploadUrl(String objectKey, String contentType, long sizeBytes) {
    String url = "https://stub-object-storage.local/" + objectKey + "?stub-upload=true";
    return new PresignedUpload(url, Instant.now().plus(15, ChronoUnit.MINUTES));
  }

  @Override
  public boolean verifyUploaded(String objectKey, long expectedSizeBytes, String expectedChecksum) {
    return true;
  }

  @Override
  public void delete(String objectKey) {
  }
}
```

- [ ] **Step 5: 테스트 실행해서 통과 확인**

Run: `cd backend && JAVA_HOME=$(/usr/libexec/java_home -v 21) ./gradlew test --tests "com.footlog.api.photo.StubObjectStorageClientTest"`
Expected: `BUILD SUCCESSFUL`, 2개 테스트 통과

- [ ] **Step 6: PhotoAttachmentRepository 실패하는 테스트 작성**

```java
package com.footlog.api.photo;

import com.footlog.api.checkin.CheckIn;
import com.footlog.api.checkin.CheckInRepository;
import com.footlog.api.common.ApiException;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;

import java.time.Instant;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@SpringBootTest
@Testcontainers
class PhotoAttachmentRepositoryTest {

  @Container
  static final PostgreSQLContainer<?> postgres =
      new PostgreSQLContainer<>(DockerImageName.parse("postgis/postgis:17-3.5")
          .asCompatibleSubstituteFor("postgres"));

  @DynamicPropertySource
  static void registerDataSourceProperties(DynamicPropertyRegistry registry) {
    registry.add("spring.datasource.url", postgres::getJdbcUrl);
    registry.add("spring.datasource.username", postgres::getUsername);
    registry.add("spring.datasource.password", postgres::getPassword);
  }

  @Autowired PhotoAttachmentRepository photoAttachmentRepository;
  @Autowired CheckInRepository checkInRepository;

  private UUID createCheckIn(UUID userId) {
    UUID id = UUID.randomUUID();
    Instant now = Instant.parse("2026-08-16T09:00:00Z");
    checkInRepository.upsert(new CheckIn(id, userId, 37.5, 127.0, 15.0, now, now, now, null));
    return id;
  }

  @Test
  void createUploadingThenCompleteMakesItReady() {
    UUID userId = UUID.randomUUID();
    UUID checkInId = createCheckIn(userId);
    UUID photoId = UUID.randomUUID();
    photoAttachmentRepository.createUploading(userId, photoId, checkInId, "photos/x", "image/jpeg", 1024,
        "checksum1", Instant.parse("2026-08-16T09:10:00Z"));

    PhotoAttachment ready = photoAttachmentRepository.complete(userId, photoId, Instant.parse("2026-08-16T09:11:00Z"));

    assertThat(ready.status()).isEqualTo("ready");
  }

  @Test
  void replacingReadyPhotoMarksPreviousDeleted() {
    UUID userId = UUID.randomUUID();
    UUID checkInId = createCheckIn(userId);
    UUID firstId = UUID.randomUUID();
    photoAttachmentRepository.createUploading(userId, firstId, checkInId, "photos/first", "image/jpeg", 1024,
        "checksum1", Instant.parse("2026-08-16T09:10:00Z"));
    photoAttachmentRepository.complete(userId, firstId, Instant.parse("2026-08-16T09:11:00Z"));

    UUID secondId = UUID.randomUUID();
    photoAttachmentRepository.createUploading(userId, secondId, checkInId, "photos/second", "image/jpeg", 2048,
        "checksum2", Instant.parse("2026-08-16T09:20:00Z"));
    photoAttachmentRepository.complete(userId, secondId, Instant.parse("2026-08-16T09:21:00Z"));

    assertThat(photoAttachmentRepository.findOwned(userId, firstId).orElseThrow().status()).isEqualTo("deleted");
    assertThat(photoAttachmentRepository.findOwned(userId, secondId).orElseThrow().status()).isEqualTo("ready");
  }

  @Test
  void rejectsCreateForDeletedCheckIn() {
    UUID userId = UUID.randomUUID();
    UUID checkInId = createCheckIn(userId);
    checkInRepository.softDelete(userId, checkInId, Instant.parse("2026-08-16T09:05:00Z"));

    assertThatThrownBy(() -> photoAttachmentRepository.createUploading(
        userId, UUID.randomUUID(), checkInId, "photos/x", "image/jpeg", 1024, "checksum",
        Instant.parse("2026-08-16T09:10:00Z")))
        .isInstanceOf(ApiException.class);
  }

  @Test
  void deleteIsIdempotent() {
    UUID userId = UUID.randomUUID();
    UUID checkInId = createCheckIn(userId);
    UUID photoId = UUID.randomUUID();
    photoAttachmentRepository.createUploading(userId, photoId, checkInId, "photos/x", "image/jpeg", 1024,
        "checksum", Instant.parse("2026-08-16T09:10:00Z"));

    photoAttachmentRepository.delete(userId, photoId, Instant.parse("2026-08-16T09:15:00Z"));
    photoAttachmentRepository.delete(userId, photoId, Instant.parse("2026-08-16T09:15:00Z"));

    assertThat(photoAttachmentRepository.findAllActiveByCheckInId(checkInId)).isEmpty();
  }
}
```

- [ ] **Step 7: 테스트 실행해서 실패 확인**

Run: `cd backend && JAVA_HOME=$(/usr/libexec/java_home -v 21) ./gradlew test --tests "com.footlog.api.photo.PhotoAttachmentRepositoryTest"`
Expected: 컴파일 실패 (`PhotoAttachment`, `PhotoAttachmentRepository`가 아직 없음)

- [ ] **Step 8: PhotoAttachmentRepository 최소 구현 작성**

```java
package com.footlog.api.photo;

import java.time.Instant;
import java.util.UUID;

public record PhotoAttachment(
    UUID id, UUID checkInId, String objectKey, String contentType, long sizeBytes, String checksum,
    String status, Instant createdAt, Instant readyAt, Instant deletedAt) {}
```

```java
package com.footlog.api.photo;

import com.footlog.api.checkin.CheckIn;
import com.footlog.api.checkin.CheckInRepository;
import com.footlog.api.common.ApiException;
import com.footlog.api.sync.SyncChangeLogRepository;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public class PhotoAttachmentRepository {

  private static final RowMapper<PhotoAttachment> ROW_MAPPER = (rs, rowNum) -> new PhotoAttachment(
      UUID.fromString(rs.getString("id")),
      UUID.fromString(rs.getString("check_in_id")),
      rs.getString("object_key"),
      rs.getString("content_type"),
      rs.getLong("size_bytes"),
      rs.getString("checksum"),
      rs.getString("status"),
      rs.getTimestamp("created_at").toInstant(),
      rs.getTimestamp("ready_at") == null ? null : rs.getTimestamp("ready_at").toInstant(),
      rs.getTimestamp("deleted_at") == null ? null : rs.getTimestamp("deleted_at").toInstant());

  private final JdbcTemplate jdbcTemplate;
  private final CheckInRepository checkInRepository;
  private final SyncChangeLogRepository syncChangeLogRepository;

  public PhotoAttachmentRepository(JdbcTemplate jdbcTemplate, CheckInRepository checkInRepository,
                                    SyncChangeLogRepository syncChangeLogRepository) {
    this.jdbcTemplate = jdbcTemplate;
    this.checkInRepository = checkInRepository;
    this.syncChangeLogRepository = syncChangeLogRepository;
  }

  public Optional<PhotoAttachment> findOwned(UUID userId, UUID id) {
    List<PhotoAttachment> rows = jdbcTemplate.query(
        "SELECT p.* FROM photo_attachments p JOIN check_ins c ON c.id = p.check_in_id " +
            "WHERE p.id = ? AND c.user_id = ?",
        ROW_MAPPER, id, userId);
    return rows.stream().findFirst();
  }

  public List<PhotoAttachment> findAllActiveByCheckInId(UUID checkInId) {
    return jdbcTemplate.query(
        "SELECT * FROM photo_attachments WHERE check_in_id = ? AND status <> 'deleted'", ROW_MAPPER, checkInId);
  }

  @Transactional
  public PhotoAttachment createUploading(UUID userId, UUID id, UUID checkInId, String objectKey,
                                          String contentType, long sizeBytes, String checksum, Instant createdAt) {
    CheckIn checkIn = checkInRepository.findById(checkInId)
        .filter(c -> c.userId().equals(userId))
        .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "CHECK_IN_NOT_FOUND", "체크인을 찾을 수 없습니다"));
    if (checkIn.deletedAt() != null) {
      throw new ApiException(HttpStatus.CONFLICT, "CHECK_IN_DELETED", "삭제된 체크인에는 사진을 추가할 수 없습니다");
    }

    Optional<PhotoAttachment> existing = findOwned(userId, id);
    if (existing.isPresent()) {
      PhotoAttachment current = existing.get();
      if (!"uploading".equals(current.status())) {
        throw new ApiException(HttpStatus.CONFLICT, "PHOTO_ALREADY_FINALIZED", "이미 완료되었거나 삭제된 첨부입니다");
      }
      return current;
    }

    jdbcTemplate.update(
        "INSERT INTO photo_attachments (id, check_in_id, object_key, content_type, size_bytes, checksum, status, created_at) " +
            "VALUES (?, ?, ?, ?, ?, ?, 'uploading', ?)",
        id, checkInId, objectKey, contentType, sizeBytes, checksum, Timestamp.from(createdAt));
    return new PhotoAttachment(id, checkInId, objectKey, contentType, sizeBytes, checksum,
        "uploading", createdAt, null, null);
  }

  @Transactional
  public PhotoAttachment complete(UUID userId, UUID id, Instant readyAt) {
    PhotoAttachment current = findOwned(userId, id)
        .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "PHOTO_NOT_FOUND", "첨부를 찾을 수 없습니다"));

    if ("ready".equals(current.status())) {
      return current;
    }
    if (!"uploading".equals(current.status())) {
      throw new ApiException(HttpStatus.CONFLICT, "PHOTO_ALREADY_FINALIZED", "이미 삭제된 첨부입니다");
    }

    // 부분 유니크 인덱스(check_in_id WHERE status='ready')를 순간적으로도 위반하지 않도록
    // 기존 ready 행을 먼저 deleted로 내린 뒤에 새 행을 ready로 올린다.
    List<UUID> previousReady = jdbcTemplate.query(
        "SELECT id FROM photo_attachments WHERE check_in_id = ? AND status = 'ready' AND deleted_at IS NULL AND id <> ?",
        (rs, rowNum) -> UUID.fromString(rs.getString("id")),
        current.checkInId(), id);
    for (UUID previousId : previousReady) {
      jdbcTemplate.update("UPDATE photo_attachments SET status = 'deleted', deleted_at = ? WHERE id = ?",
          Timestamp.from(readyAt), previousId);
      syncChangeLogRepository.append(userId, "photo_attachment", previousId, "delete", null, readyAt);
    }

    jdbcTemplate.update("UPDATE photo_attachments SET status = 'ready', ready_at = ? WHERE id = ?",
        Timestamp.from(readyAt), id);

    PhotoAttachment saved = new PhotoAttachment(current.id(), current.checkInId(), current.objectKey(),
        current.contentType(), current.sizeBytes(), current.checksum(), "ready", current.createdAt(), readyAt, null);
    syncChangeLogRepository.append(userId, "photo_attachment", id, "create", saved, readyAt);
    return saved;
  }

  @Transactional
  public void delete(UUID userId, UUID id, Instant deletedAt) {
    Optional<PhotoAttachment> existing = findOwned(userId, id);
    if (existing.isEmpty() || "deleted".equals(existing.get().status())) {
      return;
    }
    jdbcTemplate.update("UPDATE photo_attachments SET status = 'deleted', deleted_at = ? WHERE id = ?",
        Timestamp.from(deletedAt), id);
    syncChangeLogRepository.append(userId, "photo_attachment", id, "delete", null, deletedAt);
  }
}
```

- [ ] **Step 9: 테스트 실행해서 통과 확인**

Run: `cd backend && JAVA_HOME=$(/usr/libexec/java_home -v 21) ./gradlew test --tests "com.footlog.api.photo.PhotoAttachmentRepositoryTest"`
Expected: `BUILD SUCCESSFUL`, 4개 테스트 통과

- [ ] **Step 10: 커밋**

```bash
cd backend
git add src/main/resources/db/migration/V6__create_photo_attachments.sql src/main/java/com/footlog/api/photo src/test/java/com/footlog/api/photo
git commit -m "feat(photo): photo_attachments 테이블, 스토리지 클라이언트 스텁, 리포지토리 추가"
```

---

### Task 11: 사진 API (POST/complete/DELETE)

**Files:**
- Create: `backend/src/main/java/com/footlog/api/photo/PhotoAttachmentCreateRequest.java`
- Create: `backend/src/main/java/com/footlog/api/photo/PhotoAttachmentCreateResponse.java`
- Create: `backend/src/main/java/com/footlog/api/photo/PhotoAttachmentCompleteResponse.java`
- Create: `backend/src/main/java/com/footlog/api/photo/PhotoAttachmentController.java`
- Test: `backend/src/test/java/com/footlog/api/photo/PhotoAttachmentControllerTest.java`

**Interfaces:**
- Consumes: `PhotoAttachmentRepository`(Task 10), `ObjectStorageClient`(Task 10), `CurrentUserProvider`(Task 2)
- Produces: `POST /v1/photo-attachments`, `POST /v1/photo-attachments/{id}/complete`, `DELETE /v1/photo-attachments/{id}`

- [ ] **Step 1: 실패하는 테스트 작성**

```java
package com.footlog.api.photo;

import com.footlog.api.checkin.CheckIn;
import com.footlog.api.checkin.CheckInRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;

import java.time.Instant;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@Testcontainers
class PhotoAttachmentControllerTest {

  @Container
  static final PostgreSQLContainer<?> postgres =
      new PostgreSQLContainer<>(DockerImageName.parse("postgis/postgis:17-3.5")
          .asCompatibleSubstituteFor("postgres"));

  @DynamicPropertySource
  static void registerDataSourceProperties(DynamicPropertyRegistry registry) {
    registry.add("spring.datasource.url", postgres::getJdbcUrl);
    registry.add("spring.datasource.username", postgres::getUsername);
    registry.add("spring.datasource.password", postgres::getPassword);
  }

  @Autowired TestRestTemplate restTemplate;
  @Autowired CheckInRepository checkInRepository;

  private HttpHeaders headersFor(UUID userId) {
    HttpHeaders headers = new HttpHeaders();
    headers.set("X-Debug-User-Id", userId.toString());
    headers.set("Content-Type", "application/json");
    return headers;
  }

  private UUID createCheckIn(UUID userId) {
    UUID id = UUID.randomUUID();
    Instant now = Instant.parse("2026-08-16T09:00:00Z");
    checkInRepository.upsert(new CheckIn(id, userId, 37.5, 127.0, 15.0, now, now, now, null));
    return id;
  }

  @Test
  void createCompleteThenDeletePhoto() {
    UUID userId = UUID.randomUUID();
    UUID checkInId = createCheckIn(userId);
    UUID photoId = UUID.randomUUID();
    Map<String, Object> createBody = Map.of(
        "id", photoId, "checkInId", checkInId, "contentType", "image/jpeg", "sizeBytes", 1024, "checksum", "abc123");

    var createResponse = restTemplate.exchange("/v1/photo-attachments", HttpMethod.POST,
        new HttpEntity<>(createBody, headersFor(userId)), PhotoAttachmentCreateResponse.class);
    assertThat(createResponse.getStatusCode()).isEqualTo(HttpStatus.CREATED);
    assertThat(createResponse.getBody().status()).isEqualTo("uploading");

    var completeResponse = restTemplate.exchange("/v1/photo-attachments/" + photoId + "/complete", HttpMethod.POST,
        new HttpEntity<>(headersFor(userId)), PhotoAttachmentCompleteResponse.class);
    assertThat(completeResponse.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(completeResponse.getBody().status()).isEqualTo("ready");

    var deleteResponse = restTemplate.exchange("/v1/photo-attachments/" + photoId, HttpMethod.DELETE,
        new HttpEntity<>(headersFor(userId)), Void.class);
    assertThat(deleteResponse.getStatusCode()).isEqualTo(HttpStatus.OK);
  }
}
```

- [ ] **Step 2: 테스트 실행해서 실패 확인**

Run: `cd backend && JAVA_HOME=$(/usr/libexec/java_home -v 21) ./gradlew test --tests "com.footlog.api.photo.PhotoAttachmentControllerTest"`
Expected: 컴파일 실패 (DTO들과 `PhotoAttachmentController`가 아직 없음)

- [ ] **Step 3: 최소 구현 작성**

```java
package com.footlog.api.photo;

import java.util.UUID;

public record PhotoAttachmentCreateRequest(UUID id, UUID checkInId, String contentType, long sizeBytes, String checksum) {}
```

```java
package com.footlog.api.photo;

import java.time.Instant;
import java.util.UUID;

public record PhotoAttachmentCreateResponse(UUID id, UUID checkInId, String uploadUrl, Instant uploadExpiresAt, String status) {}
```

```java
package com.footlog.api.photo;

import java.time.Instant;
import java.util.UUID;

public record PhotoAttachmentCompleteResponse(UUID id, String status, Instant readyAt) {}
```

```java
package com.footlog.api.photo;

import com.footlog.api.auth.CurrentUserProvider;
import com.footlog.api.common.ApiException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import java.time.Instant;
import java.util.UUID;

@RestController
public class PhotoAttachmentController {

  private final PhotoAttachmentRepository photoAttachmentRepository;
  private final ObjectStorageClient objectStorageClient;
  private final CurrentUserProvider currentUserProvider;

  public PhotoAttachmentController(PhotoAttachmentRepository photoAttachmentRepository,
                                    ObjectStorageClient objectStorageClient,
                                    CurrentUserProvider currentUserProvider) {
    this.photoAttachmentRepository = photoAttachmentRepository;
    this.objectStorageClient = objectStorageClient;
    this.currentUserProvider = currentUserProvider;
  }

  @PostMapping("/v1/photo-attachments")
  public ResponseEntity<PhotoAttachmentCreateResponse> create(@RequestBody PhotoAttachmentCreateRequest request) {
    UUID userId = currentUserProvider.currentUserId();
    String objectKey = "photos/" + request.checkInId() + "/" + request.id();

    PhotoAttachment saved = photoAttachmentRepository.createUploading(
        userId, request.id(), request.checkInId(), objectKey,
        request.contentType(), request.sizeBytes(), request.checksum(), Instant.now());

    ObjectStorageClient.PresignedUpload upload =
        objectStorageClient.issueUploadUrl(objectKey, request.contentType(), request.sizeBytes());

    PhotoAttachmentCreateResponse body = new PhotoAttachmentCreateResponse(
        saved.id(), saved.checkInId(), upload.uploadUrl(), upload.expiresAt(), saved.status());
    return ResponseEntity.status(HttpStatus.CREATED).body(body);
  }

  @PostMapping("/v1/photo-attachments/{id}/complete")
  public PhotoAttachmentCompleteResponse complete(@PathVariable UUID id) {
    UUID userId = currentUserProvider.currentUserId();
    PhotoAttachment current = photoAttachmentRepository.findOwned(userId, id)
        .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "PHOTO_NOT_FOUND", "첨부를 찾을 수 없습니다"));

    boolean verified = objectStorageClient.verifyUploaded(current.objectKey(), current.sizeBytes(), current.checksum());
    if (!verified) {
      throw new ApiException(HttpStatus.CONFLICT, "VERIFICATION_FAILED", "업로드된 파일 검증에 실패했습니다");
    }

    PhotoAttachment saved = photoAttachmentRepository.complete(userId, id, Instant.now());
    return new PhotoAttachmentCompleteResponse(saved.id(), saved.status(), saved.readyAt());
  }

  @DeleteMapping("/v1/photo-attachments/{id}")
  public void delete(@PathVariable UUID id) {
    UUID userId = currentUserProvider.currentUserId();
    PhotoAttachment current = photoAttachmentRepository.findOwned(userId, id).orElse(null);
    if (current != null) {
      objectStorageClient.delete(current.objectKey());
    }
    photoAttachmentRepository.delete(userId, id, Instant.now());
  }
}
```

- [ ] **Step 4: 테스트 실행해서 통과 확인**

Run: `cd backend && JAVA_HOME=$(/usr/libexec/java_home -v 21) ./gradlew test --tests "com.footlog.api.photo.PhotoAttachmentControllerTest"`
Expected: `BUILD SUCCESSFUL`, 1개 테스트 통과

- [ ] **Step 5: 커밋**

```bash
cd backend
git add src/main/java/com/footlog/api/photo/PhotoAttachmentCreateRequest.java src/main/java/com/footlog/api/photo/PhotoAttachmentCreateResponse.java src/main/java/com/footlog/api/photo/PhotoAttachmentCompleteResponse.java src/main/java/com/footlog/api/photo/PhotoAttachmentController.java src/test/java/com/footlog/api/photo/PhotoAttachmentControllerTest.java
git commit -m "feat(photo): 사진 업로드 presigned API 3종 추가"
```

---

### Task 12: 체크인 연쇄 삭제 API (DELETE)

체크인 삭제 시 연결된 사진·메모도 서버가 연쇄 삭제하며 각각 별도 로그 행을 남긴다(참조 문서 §5.1). `CheckInRepository`가 `CheckInNoteRepository`/`PhotoAttachmentRepository`에 의존하면 순환 의존이 생기므로, 별도의 `CheckInDeletionService`가 세 리포지토리를 조합한다.

**Files:**
- Create: `backend/src/main/java/com/footlog/api/checkin/CheckInDeletionService.java`
- Test: `backend/src/test/java/com/footlog/api/checkin/CheckInDeletionServiceTest.java`
- Modify: `backend/src/main/java/com/footlog/api/checkin/CheckInController.java` (DELETE 매핑 추가)
- Test: `backend/src/test/java/com/footlog/api/checkin/CheckInControllerTest.java` (삭제 케이스 추가)

**Interfaces:**
- Consumes: `CheckInRepository.findById/softDelete`(Task 4), `CheckInNoteRepository.findActiveByCheckInId/delete`(Task 6), `PhotoAttachmentRepository.findAllActiveByCheckInId/delete`(Task 10), `ObjectStorageClient.delete`(Task 10)
- Produces: `CheckInDeletionService.deleteCascading(UUID userId, UUID checkInId, Instant deletedAt): void`, `DELETE /v1/check-ins/{id}`

- [ ] **Step 1: 실패하는 테스트 작성**

```java
package com.footlog.api.checkin;

import com.footlog.api.checkinnote.CheckInNoteRepository;
import com.footlog.api.photo.PhotoAttachmentRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;

import java.time.Instant;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest
@Testcontainers
class CheckInDeletionServiceTest {

  @Container
  static final PostgreSQLContainer<?> postgres =
      new PostgreSQLContainer<>(DockerImageName.parse("postgis/postgis:17-3.5")
          .asCompatibleSubstituteFor("postgres"));

  @DynamicPropertySource
  static void registerDataSourceProperties(DynamicPropertyRegistry registry) {
    registry.add("spring.datasource.url", postgres::getJdbcUrl);
    registry.add("spring.datasource.username", postgres::getUsername);
    registry.add("spring.datasource.password", postgres::getPassword);
  }

  @Autowired CheckInDeletionService checkInDeletionService;
  @Autowired CheckInRepository checkInRepository;
  @Autowired CheckInNoteRepository checkInNoteRepository;
  @Autowired PhotoAttachmentRepository photoAttachmentRepository;
  @Autowired JdbcTemplate jdbcTemplate;

  @Test
  void cascadesToNoteAndPhotoWithThreeSeparateLogRows() {
    UUID userId = UUID.randomUUID();
    UUID checkInId = UUID.randomUUID();
    Instant now = Instant.parse("2026-08-16T09:00:00Z");
    checkInRepository.upsert(new CheckIn(checkInId, userId, 37.5, 127.0, 15.0, now, now, now, null));
    checkInNoteRepository.upsert(userId, UUID.randomUUID(), checkInId, "메모", now);
    UUID photoId = UUID.randomUUID();
    photoAttachmentRepository.createUploading(userId, photoId, checkInId, "photos/x", "image/jpeg", 1024, "sum", now);
    photoAttachmentRepository.complete(userId, photoId, now);

    Instant deletedAt = Instant.parse("2026-08-16T10:00:00Z");
    checkInDeletionService.deleteCascading(userId, checkInId, deletedAt);

    assertThat(checkInRepository.findById(checkInId).orElseThrow().deletedAt()).isEqualTo(deletedAt);
    assertThat(checkInNoteRepository.findActiveByCheckInId(checkInId)).isEmpty();
    assertThat(photoAttachmentRepository.findAllActiveByCheckInId(checkInId)).isEmpty();
    Integer deleteLogCount = jdbcTemplate.queryForObject(
        "SELECT count(*) FROM sync_change_log WHERE user_id = ? AND operation = 'delete'", Integer.class, userId);
    assertThat(deleteLogCount).isEqualTo(3);
  }

  @Test
  void isIdempotentForAlreadyDeletedCheckIn() {
    UUID userId = UUID.randomUUID();
    UUID checkInId = UUID.randomUUID();
    Instant now = Instant.parse("2026-08-16T09:00:00Z");
    checkInRepository.upsert(new CheckIn(checkInId, userId, 37.5, 127.0, 15.0, now, now, now, null));

    checkInDeletionService.deleteCascading(userId, checkInId, Instant.parse("2026-08-16T10:00:00Z"));
    checkInDeletionService.deleteCascading(userId, checkInId, Instant.parse("2026-08-16T10:00:00Z"));

    Integer deleteLogCount = jdbcTemplate.queryForObject(
        "SELECT count(*) FROM sync_change_log WHERE user_id = ? AND operation = 'delete'", Integer.class, userId);
    assertThat(deleteLogCount).isEqualTo(1);
  }
}
```

- [ ] **Step 2: `CheckInControllerTest`에 삭제 케이스 추가**

`backend/src/test/java/com/footlog/api/checkin/CheckInControllerTest.java`의 `putCreatesCheckIn` 테스트 아래에 다음 테스트를 추가한다(클래스의 다른 부분은 Task 5와 동일하게 유지):

```java
  @Test
  void putThenDeleteCheckInCascadesToNoteAndPhoto() {
    UUID userId = UUID.randomUUID();
    UUID checkInId = UUID.randomUUID();
    Map<String, Object> checkInBody = Map.of(
        "latitude", 37.5, "longitude", 127.0, "accuracyM", 12.5,
        "capturedAt", "2026-08-16T09:00:00Z", "checkedInAt", "2026-08-16T09:00:05Z", "createdAt", "2026-08-16T09:00:06Z");
    restTemplate.exchange("/v1/check-ins/" + checkInId, HttpMethod.PUT,
        new HttpEntity<>(checkInBody, headersFor(userId)), CheckInResponse.class);

    var deleteResponse = restTemplate.exchange(
        "/v1/check-ins/" + checkInId, HttpMethod.DELETE,
        new HttpEntity<>(Map.of("deletedAt", "2026-08-16T10:00:00Z"), headersFor(userId)), Void.class);

    assertThat(deleteResponse.getStatusCode()).isEqualTo(HttpStatus.OK);
  }
```

이 테스트는 `Map` import가 이미 있는 기존 파일에 추가되므로 새 import는 필요 없다.

- [ ] **Step 3: 테스트 실행해서 실패 확인**

Run: `cd backend && JAVA_HOME=$(/usr/libexec/java_home -v 21) ./gradlew test --tests "com.footlog.api.checkin.CheckInDeletionServiceTest" --tests "com.footlog.api.checkin.CheckInControllerTest"`
Expected: `CheckInDeletionServiceTest`는 컴파일 실패(`CheckInDeletionService`가 아직 없음). `CheckInControllerTest`의 새 테스트는 `DELETE` 매핑이 아직 없어 404로 실패.

- [ ] **Step 4: 최소 구현 작성**

```java
package com.footlog.api.checkin;

import com.footlog.api.checkinnote.CheckInNote;
import com.footlog.api.checkinnote.CheckInNoteRepository;
import com.footlog.api.photo.ObjectStorageClient;
import com.footlog.api.photo.PhotoAttachment;
import com.footlog.api.photo.PhotoAttachmentRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Service
public class CheckInDeletionService {

  private final CheckInRepository checkInRepository;
  private final CheckInNoteRepository checkInNoteRepository;
  private final PhotoAttachmentRepository photoAttachmentRepository;
  private final ObjectStorageClient objectStorageClient;

  public CheckInDeletionService(CheckInRepository checkInRepository,
                                 CheckInNoteRepository checkInNoteRepository,
                                 PhotoAttachmentRepository photoAttachmentRepository,
                                 ObjectStorageClient objectStorageClient) {
    this.checkInRepository = checkInRepository;
    this.checkInNoteRepository = checkInNoteRepository;
    this.photoAttachmentRepository = photoAttachmentRepository;
    this.objectStorageClient = objectStorageClient;
  }

  @Transactional
  public void deleteCascading(UUID userId, UUID checkInId, Instant deletedAt) {
    boolean ownedAndActive = checkInRepository.findById(checkInId)
        .filter(c -> c.userId().equals(userId) && c.deletedAt() == null)
        .isPresent();
    if (!ownedAndActive) {
      return;
    }

    List<PhotoAttachment> activePhotos = photoAttachmentRepository.findAllActiveByCheckInId(checkInId);
    for (PhotoAttachment photo : activePhotos) {
      objectStorageClient.delete(photo.objectKey());
      photoAttachmentRepository.delete(userId, photo.id(), deletedAt);
    }

    Optional<CheckInNote> activeNote = checkInNoteRepository.findActiveByCheckInId(checkInId);
    if (activeNote.isPresent()) {
      checkInNoteRepository.delete(userId, activeNote.get().id(), deletedAt);
    }

    checkInRepository.softDelete(userId, checkInId, deletedAt);
  }
}
```

`CheckInController`에 DELETE 매핑을 추가한다(전체 파일 교체):

```java
package com.footlog.api.checkin;

import com.footlog.api.auth.CurrentUserProvider;
import com.footlog.api.common.DeletedAtRequest;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

@RestController
public class CheckInController {

  private final CheckInRepository checkInRepository;
  private final CheckInDeletionService checkInDeletionService;
  private final CurrentUserProvider currentUserProvider;

  public CheckInController(CheckInRepository checkInRepository, CheckInDeletionService checkInDeletionService,
                            CurrentUserProvider currentUserProvider) {
    this.checkInRepository = checkInRepository;
    this.checkInDeletionService = checkInDeletionService;
    this.currentUserProvider = currentUserProvider;
  }

  @PutMapping("/v1/check-ins/{id}")
  public CheckInResponse put(@PathVariable UUID id, @RequestBody CheckInRequest request) {
    UUID userId = currentUserProvider.currentUserId();
    CheckIn candidate = new CheckIn(id, userId, request.latitude(), request.longitude(), request.accuracyM(),
        request.capturedAt(), request.checkedInAt(), request.createdAt(), null);
    CheckIn saved = checkInRepository.upsert(candidate);
    return CheckInResponse.from(saved);
  }

  @DeleteMapping("/v1/check-ins/{id}")
  public void delete(@PathVariable UUID id, @RequestBody DeletedAtRequest request) {
    UUID userId = currentUserProvider.currentUserId();
    checkInDeletionService.deleteCascading(userId, id, request.deletedAt());
  }
}
```

- [ ] **Step 5: 테스트 실행해서 통과 확인**

Run: `cd backend && JAVA_HOME=$(/usr/libexec/java_home -v 21) ./gradlew test --tests "com.footlog.api.checkin.CheckInDeletionServiceTest" --tests "com.footlog.api.checkin.CheckInControllerTest"`
Expected: `BUILD SUCCESSFUL`, 5개 테스트 통과 (`CheckInDeletionServiceTest` 2개 + `CheckInControllerTest` 3개)

- [ ] **Step 6: 커밋**

```bash
cd backend
git add src/main/java/com/footlog/api/checkin/CheckInDeletionService.java src/main/java/com/footlog/api/checkin/CheckInController.java src/test/java/com/footlog/api/checkin/CheckInDeletionServiceTest.java src/test/java/com/footlog/api/checkin/CheckInControllerTest.java
git commit -m "feat(check-in): 체크인 연쇄 삭제 API 추가"
```

---

### Task 13: 복원 API (GET /v1/sync/changes)

**Files:**
- Create: `backend/src/main/java/com/footlog/api/sync/SyncChangeDto.java`
- Create: `backend/src/main/java/com/footlog/api/sync/SyncChangesResponse.java`
- Create: `backend/src/main/java/com/footlog/api/sync/SyncController.java`
- Test: `backend/src/test/java/com/footlog/api/sync/SyncControllerTest.java`

**Interfaces:**
- Consumes: `SyncChangeLogRepository.listSince`(Task 3), `CurrentUserProvider`(Task 2), `CheckInRepository`(Task 4, 테스트에서 변경 이력 생성용)
- Produces: `GET /v1/sync/changes?cursor&limit`

- [ ] **Step 1: 실패하는 테스트 작성**

```java
package com.footlog.api.sync;

import com.footlog.api.checkin.CheckIn;
import com.footlog.api.checkin.CheckInRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;

import java.time.Instant;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@Testcontainers
class SyncControllerTest {

  @Container
  static final PostgreSQLContainer<?> postgres =
      new PostgreSQLContainer<>(DockerImageName.parse("postgis/postgis:17-3.5")
          .asCompatibleSubstituteFor("postgres"));

  @DynamicPropertySource
  static void registerDataSourceProperties(DynamicPropertyRegistry registry) {
    registry.add("spring.datasource.url", postgres::getJdbcUrl);
    registry.add("spring.datasource.username", postgres::getUsername);
    registry.add("spring.datasource.password", postgres::getPassword);
  }

  @Autowired TestRestTemplate restTemplate;
  @Autowired CheckInRepository checkInRepository;

  private HttpHeaders headersFor(UUID userId) {
    HttpHeaders headers = new HttpHeaders();
    headers.set("X-Debug-User-Id", userId.toString());
    return headers;
  }

  @Test
  void returnsOnlyOwnUserChangesAndAdvancesCursor() {
    UUID userId = UUID.randomUUID();
    UUID otherUserId = UUID.randomUUID();
    Instant now = Instant.parse("2026-08-16T09:00:00Z");
    checkInRepository.upsert(new CheckIn(UUID.randomUUID(), userId, 37.5, 127.0, 15.0, now, now, now, null));
    checkInRepository.upsert(new CheckIn(UUID.randomUUID(), otherUserId, 1.0, 1.0, 15.0, now, now, now, null));

    var response = restTemplate.exchange("/v1/sync/changes?cursor=0&limit=200", HttpMethod.GET,
        new HttpEntity<>(headersFor(userId)), SyncChangesResponse.class);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody().changes()).hasSize(1);
    assertThat(response.getBody().nextCursor()).isEqualTo(response.getBody().changes().get(0).seq());
  }

  @Test
  void emptyResultKeepsCursorUnchanged() {
    UUID userId = UUID.randomUUID();

    var response = restTemplate.exchange("/v1/sync/changes?cursor=0&limit=200", HttpMethod.GET,
        new HttpEntity<>(headersFor(userId)), SyncChangesResponse.class);

    assertThat(response.getBody().changes()).isEmpty();
    assertThat(response.getBody().nextCursor()).isEqualTo(0);
  }
}
```

- [ ] **Step 2: 테스트 실행해서 실패 확인**

Run: `cd backend && JAVA_HOME=$(/usr/libexec/java_home -v 21) ./gradlew test --tests "com.footlog.api.sync.SyncControllerTest"`
Expected: 컴파일 실패 (`SyncChangeDto`, `SyncChangesResponse`, `SyncController`가 아직 없음)

- [ ] **Step 3: 최소 구현 작성**

```java
package com.footlog.api.sync;

import com.fasterxml.jackson.databind.JsonNode;

import java.time.Instant;
import java.util.UUID;

public record SyncChangeDto(long seq, String entityType, UUID entityId, String operation, JsonNode payload, Instant occurredAt) {}
```

```java
package com.footlog.api.sync;

import java.util.List;

public record SyncChangesResponse(List<SyncChangeDto> changes, long nextCursor) {}
```

```java
package com.footlog.api.sync;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.footlog.api.auth.CurrentUserProvider;
import com.footlog.api.common.ApiException;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

@RestController
public class SyncController {

  private static final int MAX_LIMIT = 200;

  private final SyncChangeLogRepository syncChangeLogRepository;
  private final CurrentUserProvider currentUserProvider;
  private final ObjectMapper objectMapper;

  public SyncController(SyncChangeLogRepository syncChangeLogRepository,
                         CurrentUserProvider currentUserProvider,
                         ObjectMapper objectMapper) {
    this.syncChangeLogRepository = syncChangeLogRepository;
    this.currentUserProvider = currentUserProvider;
    this.objectMapper = objectMapper;
  }

  @GetMapping("/v1/sync/changes")
  public SyncChangesResponse changes(
      @RequestParam(defaultValue = "0") long cursor,
      @RequestParam(defaultValue = "200") int limit) {
    if (cursor < 0) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "VALIDATION_ERROR", "cursor는 0 이상이어야 합니다");
    }
    int boundedLimit = Math.min(Math.max(limit, 1), MAX_LIMIT);
    UUID userId = currentUserProvider.currentUserId();

    List<SyncChangeRow> rows = syncChangeLogRepository.listSince(userId, cursor, boundedLimit);
    List<SyncChangeDto> changes = rows.stream()
        .map(row -> new SyncChangeDto(
            row.seq(), row.entityType(), row.entityId(), row.operation(),
            readPayload(row.payloadJson()), row.occurredAt()))
        .toList();

    long nextCursor = changes.isEmpty() ? cursor : changes.get(changes.size() - 1).seq();
    return new SyncChangesResponse(changes, nextCursor);
  }

  private JsonNode readPayload(String json) {
    if (json == null) {
      return null;
    }
    try {
      return objectMapper.readTree(json);
    } catch (Exception e) {
      throw new IllegalStateException("payload 파싱 실패", e);
    }
  }
}
```

- [ ] **Step 4: 테스트 실행해서 통과 확인**

Run: `cd backend && JAVA_HOME=$(/usr/libexec/java_home -v 21) ./gradlew test --tests "com.footlog.api.sync.SyncControllerTest"`
Expected: `BUILD SUCCESSFUL`, 2개 테스트 통과

- [ ] **Step 5: 전체 테스트 스위트 실행**

Run: `cd backend && JAVA_HOME=$(/usr/libexec/java_home -v 21) ./gradlew test`
Expected: `BUILD SUCCESSFUL`, 이 계획에서 작성한 모든 테스트와 기존 `PostgisContextTest` 포함 전체 통과

- [ ] **Step 6: 커밋**

```bash
cd backend
git add src/main/java/com/footlog/api/sync/SyncChangeDto.java src/main/java/com/footlog/api/sync/SyncChangesResponse.java src/main/java/com/footlog/api/sync/SyncController.java src/test/java/com/footlog/api/sync/SyncControllerTest.java
git commit -m "feat(sync): 커서 기반 변경 이력 조회 API 추가"
```
