package com.footlog.api.dailyreflection;

import java.time.Instant;
import java.time.LocalDate;

public record DailyReflectionRequest(LocalDate date, String body, Instant updatedAt) {}
