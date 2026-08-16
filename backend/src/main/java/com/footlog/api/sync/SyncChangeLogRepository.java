package com.footlog.api.sync;

import tools.jackson.databind.ObjectMapper;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

@Repository
public class SyncChangeLogRepository {

  private final JdbcTemplate jdbcTemplate;
  private final ObjectMapper objectMapper;

  public SyncChangeLogRepository(JdbcTemplate jdbcTemplate, ObjectMapper objectMapper) {
    this.jdbcTemplate = jdbcTemplate;
    this.objectMapper = objectMapper;
  }

  public void append(UUID userId, String entityType, UUID entityId, String operation, Object payload, Instant occurredAt) {
    String payloadJson = payload == null ? null : writeJson(payload);
    jdbcTemplate.update(
        "INSERT INTO sync_change_log (user_id, entity_type, entity_id, operation, payload, occurred_at) " +
            "VALUES (?, ?, ?, ?, ?::jsonb, ?)",
        userId, entityType, entityId, operation, payloadJson, Timestamp.from(occurredAt));
  }

  public List<SyncChangeRow> listSince(UUID userId, long cursor, int limit) {
    return jdbcTemplate.query(
        "SELECT seq, entity_type, entity_id, operation, payload::text AS payload_text, occurred_at " +
            "FROM sync_change_log WHERE user_id = ? AND seq > ? ORDER BY seq LIMIT ?",
        (rs, rowNum) -> new SyncChangeRow(
            rs.getLong("seq"),
            rs.getString("entity_type"),
            UUID.fromString(rs.getString("entity_id")),
            rs.getString("operation"),
            rs.getString("payload_text"),
            rs.getTimestamp("occurred_at").toInstant()),
        userId, cursor, limit);
  }

  private String writeJson(Object payload) {
    try {
      return objectMapper.writeValueAsString(payload);
    } catch (Exception e) {
      throw new IllegalStateException("payload 직렬화 실패", e);
    }
  }
}
