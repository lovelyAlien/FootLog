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

  /**
   * check_ins.user_id로 소유자를 판별하는 소유권-무관(unscoped) 조회.
   * id가 이미 다른 사용자 소유 체크인 아래 존재하는지 사전에 확인하기 위해 사용한다
   * (DailyReflectionRepository.upsert / CheckInRepository.upsert와 동일한 가드 패턴).
   */
  private Optional<UUID> findOwnerUserId(UUID id) {
    List<UUID> rows = jdbcTemplate.query(
        "SELECT c.user_id AS owner_user_id FROM photo_attachments p JOIN check_ins c ON c.id = p.check_in_id " +
            "WHERE p.id = ?",
        (rs, rowNum) -> UUID.fromString(rs.getString("owner_user_id")), id);
    return rows.stream().findFirst();
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

    Optional<UUID> existingOwner = findOwnerUserId(id);
    if (existingOwner.isPresent() && !existingOwner.get().equals(userId)) {
      throw new ApiException(HttpStatus.NOT_FOUND, "PHOTO_NOT_FOUND", "첨부를 찾을 수 없습니다");
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
