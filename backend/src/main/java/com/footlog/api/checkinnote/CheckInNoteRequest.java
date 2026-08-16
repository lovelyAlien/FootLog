package com.footlog.api.checkinnote;

import java.time.Instant;
import java.util.UUID;

public record CheckInNoteRequest(UUID checkInId, String body, Instant updatedAt) {}
