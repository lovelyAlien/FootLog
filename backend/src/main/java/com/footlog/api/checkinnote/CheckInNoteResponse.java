package com.footlog.api.checkinnote;

import java.time.Instant;
import java.util.UUID;

public record CheckInNoteResponse(UUID id, UUID checkInId, String body, Instant updatedAt, Instant deletedAt) {

  static CheckInNoteResponse from(CheckInNote note) {
    return new CheckInNoteResponse(note.id(), note.checkInId(), note.body(), note.updatedAt(), note.deletedAt());
  }
}
