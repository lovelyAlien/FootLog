package com.footlog.api.sync;

import java.util.List;

public record SyncChangesResponse(List<SyncChangeDto> changes, long nextCursor) {}
