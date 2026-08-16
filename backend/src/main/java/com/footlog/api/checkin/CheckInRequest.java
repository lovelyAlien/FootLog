package com.footlog.api.checkin;

import java.time.Instant;

public record CheckInRequest(double latitude, double longitude, double accuracyM,
                              Instant capturedAt, Instant checkedInAt, Instant createdAt) {}
