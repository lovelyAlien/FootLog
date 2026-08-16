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
