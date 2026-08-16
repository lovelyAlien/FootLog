package com.footlog.api.dailyreflection;

import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

public record DailyReflection(UUID id, UUID userId, LocalDate date, String body, Instant updatedAt, Instant deletedAt) {}
