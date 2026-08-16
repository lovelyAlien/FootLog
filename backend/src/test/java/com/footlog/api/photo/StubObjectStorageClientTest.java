package com.footlog.api.photo;

import org.junit.jupiter.api.Test;

import java.time.Instant;

import static org.assertj.core.api.Assertions.assertThat;

class StubObjectStorageClientTest {

  private final StubObjectStorageClient client = new StubObjectStorageClient();

  @Test
  void issuesUploadUrlWithFutureExpiry() {
    ObjectStorageClient.PresignedUpload upload = client.issueUploadUrl("photos/a/b", "image/jpeg", 1024L);

    assertThat(upload.uploadUrl()).contains("photos/a/b");
    assertThat(upload.expiresAt()).isAfter(Instant.now());
  }

  @Test
  void verifyUploadedAlwaysSucceedsForStub() {
    assertThat(client.verifyUploaded("photos/a/b", 1024L, "checksum")).isTrue();
  }
}
