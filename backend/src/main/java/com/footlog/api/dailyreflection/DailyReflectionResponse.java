package com.footlog.api.dailyreflection;

import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

public record DailyReflectionResponse(UUID id, LocalDate date, String body, Instant updatedAt, Instant deletedAt) {

  static DailyReflectionResponse from(DailyReflection reflection) {
    return new DailyReflectionResponse(reflection.id(), reflection.date(), reflection.body(),
        reflection.updatedAt(), reflection.deletedAt());
  }
}
