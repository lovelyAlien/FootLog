package com.footlog.api.photo;

import java.time.Instant;
import java.util.UUID;

public record PhotoAttachmentCompleteResponse(UUID id, String status, Instant readyAt) {}
