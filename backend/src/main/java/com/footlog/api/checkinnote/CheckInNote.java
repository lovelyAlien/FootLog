package com.footlog.api.checkinnote;

import java.time.Instant;
import java.util.UUID;

public record CheckInNote(UUID id, UUID checkInId, String body, Instant updatedAt, Instant deletedAt) {}
