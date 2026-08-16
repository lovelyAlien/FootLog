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
    return findById(id).filter(reflection -> reflection.userId().equals(userId));
  }

  private Optional<DailyReflection> findById(UUID id) {
    List<DailyReflection> rows = jdbcTemplate.query(
        "SELECT * FROM daily_reflections WHERE id = ?", ROW_MAPPER, id);
    return rows.stream().findFirst();
  }

  @Transactional
  public DailyReflection upsert(UUID userId, UUID id, LocalDate date, String body, Instant updatedAt) {
    Optional<DailyReflection> existingById = findById(id);

    if (existingById.isPresent() && !existingById.get().userId().equals(userId)) {
      throw new ApiException(HttpStatus.NOT_FOUND, "REFLECTION_NOT_FOUND", "회고를 찾을 수 없습니다");
    }

    if (existingById.isPresent() && existingById.get().deletedAt() != null) {
      throw new ApiException(HttpStatus.CONFLICT, "REFLECTION_DELETED", "삭제된 회고는 수정할 수 없습니다");
    }

    if (existingById.isPresent() && !updatedAt.isAfter(existingById.get().updatedAt())) {
      return existingById.get();
    }

    assertDateAvailable(userId, date, id);

    if (existingById.isEmpty()) {
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
