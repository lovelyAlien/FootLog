package com.footlog.api.dailyreflection;

import com.footlog.api.common.ApiException;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.HttpStatus;
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
import static org.assertj.core.api.Assertions.assertThatCode;
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

  @Test
  void upsertRejectsDifferentUserForSameId() {
    UUID userA = UUID.randomUUID();
    UUID userB = UUID.randomUUID();
    UUID id = UUID.randomUUID();
    LocalDate date = LocalDate.of(2026, 8, 16);
    repository.upsert(userA, id, date, "userA 회고", Instant.parse("2026-08-16T21:00:00Z"));

    assertThatThrownBy(() ->
        repository.upsert(userB, id, date, "userB 회고", Instant.parse("2026-08-16T21:05:00Z")))
        .isInstanceOf(ApiException.class)
        .satisfies(thrown -> {
          ApiException apiException = (ApiException) thrown;
          assertThat(apiException.getStatus()).isEqualTo(HttpStatus.NOT_FOUND);
          assertThat(apiException.getCode()).isEqualTo("REFLECTION_NOT_FOUND");
        });
  }

  @Test
  void deleteDoesNothingForWrongUser() {
    UUID userA = UUID.randomUUID();
    UUID userB = UUID.randomUUID();
    UUID id = UUID.randomUUID();
    LocalDate date = LocalDate.of(2026, 8, 16);
    repository.upsert(userA, id, date, "userA 회고", Instant.parse("2026-08-16T21:00:00Z"));

    assertThatCode(() ->
        repository.delete(userB, id, Instant.parse("2026-08-16T21:10:00Z")))
        .doesNotThrowAnyException();

    assertThat(repository.findOwned(userA, id).orElseThrow().deletedAt()).isNull();
  }
}
