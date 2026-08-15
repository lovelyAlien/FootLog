package com.footlog.api.auth;

import java.util.UUID;

public interface CurrentUserProvider {
  UUID currentUserId();
}
