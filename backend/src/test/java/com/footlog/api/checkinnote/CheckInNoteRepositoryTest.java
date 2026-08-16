package com.footlog.api.checkinnote;

import com.footlog.api.checkin.CheckIn;
import com.footlog.api.checkin.CheckInRepository;
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
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
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

  @Test
  void upsertRejectsNoteForCheckInOwnedByAnotherUser() {
    UUID userA = UUID.randomUUID();
    UUID userB = UUID.randomUUID();
    UUID checkInId = createCheckIn(userA);

    assertThatThrownBy(() ->
        checkInNoteRepository.upsert(userB, UUID.randomUUID(), checkInId, "메모", Instant.parse("2026-08-16T09:05:00Z")))
        .isInstanceOf(ApiException.class)
        .satisfies(thrown -> {
          ApiException apiException = (ApiException) thrown;
          assertThat(apiException.getStatus()).isEqualTo(HttpStatus.NOT_FOUND);
          assertThat(apiException.getCode()).isEqualTo("CHECK_IN_NOT_FOUND");
        });
  }

  @Test
  void deleteDoesNothingForCheckInOwnedByAnotherUser() {
    UUID userA = UUID.randomUUID();
    UUID userB = UUID.randomUUID();
    UUID checkInId = createCheckIn(userA);
    UUID noteId = UUID.randomUUID();
    checkInNoteRepository.upsert(userA, noteId, checkInId, "메모", Instant.parse("2026-08-16T09:05:00Z"));

    assertThatCode(() ->
        checkInNoteRepository.delete(userB, noteId, Instant.parse("2026-08-16T09:10:00Z")))
        .doesNotThrowAnyException();

    assertThat(checkInNoteRepository.findActiveByCheckInId(checkInId)).isPresent();
  }
}
