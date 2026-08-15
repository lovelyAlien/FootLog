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
import org.springframework.http.HttpStatus;

import java.time.Instant;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
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

  @Test
  void upsertRejectsDifferentUserForSameId() {
    UUID userA = UUID.randomUUID();
    UUID userB = UUID.randomUUID();
    UUID id = UUID.randomUUID();
    checkInRepository.upsert(newCandidate(userA, id, 37.5));

    assertThatThrownBy(() -> checkInRepository.upsert(newCandidate(userB, id, 37.5)))
        .isInstanceOf(ApiException.class)
        .satisfies(thrown -> {
          ApiException apiException = (ApiException) thrown;
          assertThat(apiException.getStatus()).isEqualTo(HttpStatus.NOT_FOUND);
          assertThat(apiException.getCode()).isEqualTo("CHECK_IN_NOT_FOUND");
        });
  }

  @Test
  void softDeleteDoesNothingForWrongUser() {
    UUID userA = UUID.randomUUID();
    UUID userB = UUID.randomUUID();
    UUID id = UUID.randomUUID();
    checkInRepository.upsert(newCandidate(userA, id, 37.5));
    Instant deletedAt = Instant.parse("2026-08-16T10:00:00Z");

    assertThatCode(() -> checkInRepository.softDelete(userB, id, deletedAt)).doesNotThrowAnyException();

    assertThat(checkInRepository.findById(id).orElseThrow().deletedAt()).isNull();
  }
}
