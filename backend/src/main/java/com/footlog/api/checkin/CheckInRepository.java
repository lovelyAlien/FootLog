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
