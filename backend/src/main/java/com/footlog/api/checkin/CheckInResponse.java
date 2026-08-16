package com.footlog.api.checkin;

import java.time.Instant;
import java.util.UUID;

public record CheckInResponse(UUID id, double latitude, double longitude, double accuracyM,
                               Instant capturedAt, Instant checkedInAt, Instant createdAt, Instant deletedAt) {

  static CheckInResponse from(CheckIn checkIn) {
    return new CheckInResponse(checkIn.id(), checkIn.latitude(), checkIn.longitude(), checkIn.accuracyM(),
        checkIn.capturedAt(), checkIn.checkedInAt(), checkIn.createdAt(), checkIn.deletedAt());
  }
}
