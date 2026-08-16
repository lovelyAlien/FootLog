package com.footlog.api.photo;

import java.time.Instant;
import java.util.UUID;

public record PhotoAttachmentCreateResponse(UUID id, UUID checkInId, String uploadUrl, Instant uploadExpiresAt, String status) {}
