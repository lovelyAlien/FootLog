package com.footlog.api.sync;

import java.time.Instant;
import java.util.UUID;

public record SyncChangeRow(long seq, String entityType, UUID entityId, String operation, String payloadJson, Instant occurredAt) {}
