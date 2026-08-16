package com.footlog.api.photo;

import java.time.Instant;

public interface ObjectStorageClient {

  PresignedUpload issueUploadUrl(String objectKey, String contentType, long sizeBytes);

  boolean verifyUploaded(String objectKey, long expectedSizeBytes, String expectedChecksum);

  void delete(String objectKey);

  record PresignedUpload(String uploadUrl, Instant expiresAt) {}
}
