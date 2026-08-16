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
  @Autowired org.springframework.jdbc.core.JdbcTemplate jdbcTemplate;

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

  @Test
  void recreatingNoteAfterDeleteWithNewIdSucceeds() {
    UUID userId = UUID.randomUUID();
    UUID checkInId = createCheckIn(userId);
    UUID firstNoteId = UUID.randomUUID();
    checkInNoteRepository.upsert(userId, firstNoteId, checkInId, "첫 메모", Instant.parse("2026-08-16T09:05:00Z"));
    checkInNoteRepository.delete(userId, firstNoteId, Instant.parse("2026-08-16T09:10:00Z"));

    UUID secondNoteId = UUID.randomUUID();
    CheckInNote recreated = checkInNoteRepository.upsert(
        userId, secondNoteId, checkInId, "새 메모", Instant.parse("2026-08-16T09:15:00Z"));

    assertThat(recreated.body()).isEqualTo("새 메모");
    assertThat(checkInNoteRepository.findActiveByCheckInId(checkInId)).contains(recreated);
  }

  @Test
  void upsertRejectsForNoteOwnedByAnotherUser() {
    UUID userA = UUID.randomUUID();
    UUID userB = UUID.randomUUID();
    UUID checkInIdA = createCheckIn(userA);
    UUID noteId = UUID.randomUUID();
    checkInNoteRepository.upsert(userA, noteId, checkInIdA, "메모", Instant.parse("2026-08-16T09:05:00Z"));

    // userB의 요청이 userA 소유 체크인에 이미 존재하는 noteId를 재사용하는 경우.
    // userB 소유 체크인은 별도로 존재하므로 체크인 소유권 검증은 통과하지만,
    // noteId는 findOwned(userB, noteId)로는 찾을 수 없다 (조인 대상 check_in이 userA 소유이므로).
    // 이 경우 INSERT로 빠져 PK 충돌이 나면 안 되고, 소유권 없음으로 거부되어야 한다.
    UUID checkInIdB = createCheckIn(userB);

    assertThatThrownBy(() ->
        checkInNoteRepository.upsert(userB, noteId, checkInIdB, "다른 메모", Instant.parse("2026-08-16T09:15:00Z")))
        .isInstanceOf(ApiException.class)
        .satisfies(thrown -> {
          ApiException apiException = (ApiException) thrown;
          assertThat(apiException.getStatus()).isEqualTo(HttpStatus.NOT_FOUND);
          assertThat(apiException.getCode()).isEqualTo("CHECK_IN_NOTE_NOT_FOUND");
        });
  }

  @Test
  void upsertRejectsWriteToDeletedNote() {
    UUID userId = UUID.randomUUID();
    UUID checkInId = createCheckIn(userId);
    UUID noteId = UUID.randomUUID();
    checkInNoteRepository.upsert(userId, noteId, checkInId, "메모", Instant.parse("2026-08-16T09:05:00Z"));
    checkInNoteRepository.delete(userId, noteId, Instant.parse("2026-08-16T09:10:00Z"));

    assertThatThrownBy(() ->
        checkInNoteRepository.upsert(userId, noteId, checkInId, "수정 시도", Instant.parse("2026-08-16T09:15:00Z")))
        .isInstanceOf(ApiException.class)
        .satisfies(thrown -> {
          ApiException apiException = (ApiException) thrown;
          assertThat(apiException.getStatus()).isEqualTo(HttpStatus.CONFLICT);
          assertThat(apiException.getCode()).isEqualTo("CHECK_IN_NOTE_DELETED");
        });
  }

  @Test
  void recordsSyncLogRowsForCreateAndUpdate() {
    UUID userId = UUID.randomUUID();
    UUID checkInId = createCheckIn(userId);
    UUID noteId = UUID.randomUUID();

    checkInNoteRepository.upsert(userId, noteId, checkInId, "첫 메모", Instant.parse("2026-08-16T09:05:00Z"));

    Integer createCount = jdbcTemplate.queryForObject(
        "SELECT count(*) FROM sync_change_log WHERE entity_id = ? AND operation = 'create'",
        Integer.class, noteId);
    assertThat(createCount).isEqualTo(1);

    checkInNoteRepository.upsert(userId, noteId, checkInId, "수정된 메모", Instant.parse("2026-08-16T09:10:00Z"));

    Integer updateCount = jdbcTemplate.queryForObject(
        "SELECT count(*) FROM sync_change_log WHERE entity_id = ? AND operation = 'update'",
        Integer.class, noteId);
    assertThat(updateCount).isEqualTo(1);
  }
}
