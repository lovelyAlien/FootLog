package com.footlog.api.photo;

import org.springframework.stereotype.Component;

import java.time.Instant;
import java.time.temporal.ChronoUnit;

/**
 * 실제 객체 스토리지 연동(사전 서명 URL 발급) 전까지 사용하는 스텁.
 * 검증은 항상 성공한다고 가정하고, 삭제는 아무 동작도 하지 않는다.
 */
@Component
public class StubObjectStorageClient implements ObjectStorageClient {

  @Override
  public PresignedUpload issueUploadUrl(String objectKey, String contentType, long sizeBytes) {
    String url = "https://stub-object-storage.local/" + objectKey + "?stub-upload=true";
    return new PresignedUpload(url, Instant.now().plus(15, ChronoUnit.MINUTES));
  }

  @Override
  public boolean verifyUploaded(String objectKey, long expectedSizeBytes, String expectedChecksum) {
    return true;
  }

  @Override
  public void delete(String objectKey) {
  }
}
