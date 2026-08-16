package com.footlog.api.checkinnote;

import com.footlog.api.auth.CurrentUserProvider;
import com.footlog.api.common.DeletedAtRequest;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

@RestController
public class CheckInNoteController {

  private final CheckInNoteRepository checkInNoteRepository;
  private final CurrentUserProvider currentUserProvider;

  public CheckInNoteController(CheckInNoteRepository checkInNoteRepository, CurrentUserProvider currentUserProvider) {
    this.checkInNoteRepository = checkInNoteRepository;
    this.currentUserProvider = currentUserProvider;
  }

  @PutMapping("/v1/check-in-notes/{id}")
  public CheckInNoteResponse put(@PathVariable UUID id, @RequestBody CheckInNoteRequest request) {
    UUID userId = currentUserProvider.currentUserId();
    CheckInNote saved = checkInNoteRepository.upsert(userId, id, request.checkInId(), request.body(), request.updatedAt());
    return CheckInNoteResponse.from(saved);
  }

  @DeleteMapping("/v1/check-in-notes/{id}")
  public void delete(@PathVariable UUID id, @RequestBody DeletedAtRequest request) {
    UUID userId = currentUserProvider.currentUserId();
    checkInNoteRepository.delete(userId, id, request.deletedAt());
  }
}
