package com.footlog.api.photo;

import java.util.UUID;

public record PhotoAttachmentCreateRequest(UUID id, UUID checkInId, String contentType, long sizeBytes, String checksum) {}
