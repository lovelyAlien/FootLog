package com.footlog.api.checkin;

import com.footlog.api.auth.CurrentUserProvider;
import com.footlog.api.common.DeletedAtRequest;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

@RestController
public class CheckInController {

  private final CheckInRepository checkInRepository;
  private final CheckInDeletionService checkInDeletionService;
  private final CurrentUserProvider currentUserProvider;

  public CheckInController(CheckInRepository checkInRepository, CheckInDeletionService checkInDeletionService,
                            CurrentUserProvider currentUserProvider) {
    this.checkInRepository = checkInRepository;
    this.checkInDeletionService = checkInDeletionService;
    this.currentUserProvider = currentUserProvider;
  }

  @PutMapping("/v1/check-ins/{id}")
  public CheckInResponse put(@PathVariable UUID id, @RequestBody CheckInRequest request) {
    UUID userId = currentUserProvider.currentUserId();
    CheckIn candidate = new CheckIn(id, userId, request.latitude(), request.longitude(), request.accuracyM(),
        request.capturedAt(), request.checkedInAt(), request.createdAt(), null);
    CheckIn saved = checkInRepository.upsert(candidate);
    return CheckInResponse.from(saved);
  }

  @DeleteMapping("/v1/check-ins/{id}")
  public void delete(@PathVariable UUID id, @RequestBody DeletedAtRequest request) {
    UUID userId = currentUserProvider.currentUserId();
    checkInDeletionService.deleteCascading(userId, id, request.deletedAt());
  }
}
