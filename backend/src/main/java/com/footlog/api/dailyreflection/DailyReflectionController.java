package com.footlog.api.dailyreflection;

import com.footlog.api.auth.CurrentUserProvider;
import com.footlog.api.common.DeletedAtRequest;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

@RestController
public class DailyReflectionController {

  private final DailyReflectionRepository dailyReflectionRepository;
  private final CurrentUserProvider currentUserProvider;

  public DailyReflectionController(DailyReflectionRepository dailyReflectionRepository,
                                    CurrentUserProvider currentUserProvider) {
    this.dailyReflectionRepository = dailyReflectionRepository;
    this.currentUserProvider = currentUserProvider;
  }

  @PutMapping("/v1/daily-reflections/{id}")
  public DailyReflectionResponse put(@PathVariable UUID id, @RequestBody DailyReflectionRequest request) {
    UUID userId = currentUserProvider.currentUserId();
    DailyReflection saved = dailyReflectionRepository.upsert(userId, id, request.date(), request.body(), request.updatedAt());
    return DailyReflectionResponse.from(saved);
  }

  @DeleteMapping("/v1/daily-reflections/{id}")
  public void delete(@PathVariable UUID id, @RequestBody DeletedAtRequest request) {
    UUID userId = currentUserProvider.currentUserId();
    dailyReflectionRepository.delete(userId, id, request.deletedAt());
  }
}
