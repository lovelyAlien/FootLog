package com.footlog.api.photo;

import com.footlog.api.auth.CurrentUserProvider;
import com.footlog.api.common.ApiException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import java.time.Instant;
import java.util.UUID;

@RestController
public class PhotoAttachmentController {

  private final PhotoAttachmentRepository photoAttachmentRepository;
  private final ObjectStorageClient objectStorageClient;
  private final CurrentUserProvider currentUserProvider;

  public PhotoAttachmentController(PhotoAttachmentRepository photoAttachmentRepository,
                                    ObjectStorageClient objectStorageClient,
                                    CurrentUserProvider currentUserProvider) {
    this.photoAttachmentRepository = photoAttachmentRepository;
    this.objectStorageClient = objectStorageClient;
    this.currentUserProvider = currentUserProvider;
  }

  @PostMapping("/v1/photo-attachments")
  public ResponseEntity<PhotoAttachmentCreateResponse> create(@RequestBody PhotoAttachmentCreateRequest request) {
    UUID userId = currentUserProvider.currentUserId();
    String objectKey = "photos/" + request.checkInId() + "/" + request.id();

    PhotoAttachment saved = photoAttachmentRepository.createUploading(
        userId, request.id(), request.checkInId(), objectKey,
        request.contentType(), request.sizeBytes(), request.checksum(), Instant.now());

    ObjectStorageClient.PresignedUpload upload =
        objectStorageClient.issueUploadUrl(objectKey, request.contentType(), request.sizeBytes());

    PhotoAttachmentCreateResponse body = new PhotoAttachmentCreateResponse(
        saved.id(), saved.checkInId(), upload.uploadUrl(), upload.expiresAt(), saved.status());
    return ResponseEntity.status(HttpStatus.CREATED).body(body);
  }

  @PostMapping("/v1/photo-attachments/{id}/complete")
  public PhotoAttachmentCompleteResponse complete(@PathVariable UUID id) {
    UUID userId = currentUserProvider.currentUserId();
    PhotoAttachment current = photoAttachmentRepository.findOwned(userId, id)
        .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "PHOTO_NOT_FOUND", "첨부를 찾을 수 없습니다"));

    boolean verified = objectStorageClient.verifyUploaded(current.objectKey(), current.sizeBytes(), current.checksum());
    if (!verified) {
      throw new ApiException(HttpStatus.CONFLICT, "VERIFICATION_FAILED", "업로드된 파일 검증에 실패했습니다");
    }

    PhotoAttachment saved = photoAttachmentRepository.complete(userId, id, Instant.now());
    return new PhotoAttachmentCompleteResponse(saved.id(), saved.status(), saved.readyAt());
  }

  @DeleteMapping("/v1/photo-attachments/{id}")
  public void delete(@PathVariable UUID id) {
    UUID userId = currentUserProvider.currentUserId();
    PhotoAttachment current = photoAttachmentRepository.findOwned(userId, id).orElse(null);
    if (current != null) {
      objectStorageClient.delete(current.objectKey());
    }
    photoAttachmentRepository.delete(userId, id, Instant.now());
  }
}
