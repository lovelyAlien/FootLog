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
