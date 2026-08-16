package com.footlog.api.photo;

import java.time.Instant;
import java.util.UUID;

public record PhotoAttachment(
    UUID id, UUID checkInId, String objectKey, String contentType, long sizeBytes, String checksum,
    String status, Instant createdAt, Instant readyAt, Instant deletedAt) {}
