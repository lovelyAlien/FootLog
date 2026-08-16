package com.footlog.api.photo;

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

  @Test
  void createUploadingRejectsForCheckInOwnedByAnotherUser() {
    UUID userA = UUID.randomUUID();
    UUID userB = UUID.randomUUID();
    UUID checkInIdA = createCheckIn(userA);
    UUID photoId = UUID.randomUUID();
    photoAttachmentRepository.createUploading(userA, photoId, checkInIdA, "photos/x", "image/jpeg", 1024,
        "checksum", Instant.parse("2026-08-16T09:10:00Z"));

    // userB의 요청이 userA 소유 체크인에 이미 존재하는 photoId를 재사용하는 경우.
    // userB 소유 체크인은 별도로 존재하므로 체크인 소유권 검증은 통과하지만,
    // photoId는 findOwned(userB, photoId)로는 찾을 수 없다 (조인 대상 check_in이 userA 소유이므로).
    // 이 경우 INSERT로 빠져 PK 충돌이 나면 안 되고, 소유권 없음으로 거부되어야 한다.
    UUID checkInIdB = createCheckIn(userB);

    assertThatThrownBy(() -> photoAttachmentRepository.createUploading(
        userB, photoId, checkInIdB, "photos/y", "image/jpeg", 2048, "checksum2",
        Instant.parse("2026-08-16T09:15:00Z")))
        .isInstanceOf(ApiException.class)
        .satisfies(thrown -> {
          ApiException apiException = (ApiException) thrown;
          assertThat(apiException.getStatus()).isEqualTo(HttpStatus.NOT_FOUND);
          assertThat(apiException.getCode()).isEqualTo("PHOTO_NOT_FOUND");
        });
  }
}
