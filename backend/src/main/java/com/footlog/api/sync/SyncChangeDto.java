package com.footlog.api.sync;

import tools.jackson.databind.JsonNode;

import java.time.Instant;
import java.util.UUID;

public record SyncChangeDto(long seq, String entityType, UUID entityId, String operation, JsonNode payload, Instant occurredAt) {}
