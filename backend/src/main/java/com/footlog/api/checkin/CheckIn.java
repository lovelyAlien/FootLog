package com.footlog.api.checkin;

import java.time.Instant;
import java.util.UUID;

public record CheckIn(
    UUID id,
    UUID userId,
    double latitude,
    double longitude,
    double accuracyM,
    Instant capturedAt,
    Instant checkedInAt,
    Instant createdAt,
    Instant deletedAt) {}
