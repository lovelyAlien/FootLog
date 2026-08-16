package com.footlog.api.sync;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import com.footlog.api.auth.CurrentUserProvider;
import com.footlog.api.common.ApiException;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

@RestController
public class SyncController {

  private static final int MAX_LIMIT = 200;

  private final SyncChangeLogRepository syncChangeLogRepository;
  private final CurrentUserProvider currentUserProvider;
  private final ObjectMapper objectMapper;

  public SyncController(SyncChangeLogRepository syncChangeLogRepository,
                         CurrentUserProvider currentUserProvider,
                         ObjectMapper objectMapper) {
    this.syncChangeLogRepository = syncChangeLogRepository;
    this.currentUserProvider = currentUserProvider;
    this.objectMapper = objectMapper;
  }

  @GetMapping("/v1/sync/changes")
  public SyncChangesResponse changes(
      @RequestParam(defaultValue = "0") long cursor,
      @RequestParam(defaultValue = "200") int limit) {
    if (cursor < 0) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "VALIDATION_ERROR", "cursor는 0 이상이어야 합니다");
    }
    int boundedLimit = Math.min(Math.max(limit, 1), MAX_LIMIT);
    UUID userId = currentUserProvider.currentUserId();

    List<SyncChangeRow> rows = syncChangeLogRepository.listSince(userId, cursor, boundedLimit);
    List<SyncChangeDto> changes = rows.stream()
        .map(row -> new SyncChangeDto(
            row.seq(), row.entityType(), row.entityId(), row.operation(),
            readPayload(row.payloadJson()), row.occurredAt()))
        .toList();

    long nextCursor = changes.isEmpty() ? cursor : changes.get(changes.size() - 1).seq();
    return new SyncChangesResponse(changes, nextCursor);
  }

  private JsonNode readPayload(String json) {
    if (json == null) {
      return null;
    }
    try {
      return objectMapper.readTree(json);
    } catch (Exception e) {
      throw new IllegalStateException("payload 파싱 실패", e);
    }
  }
}
