package com.footlog.api.auth;

import com.footlog.api.common.ApiException;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.context.annotation.RequestScope;

import java.util.UUID;

/**
 * 카카오 세션 인증이 구현되기 전까지 사용하는 임시 스텁.
 * 실제 인증이 들어오면 이 구현체만 세션 기반으로 교체한다.
 */
@Component
@RequestScope
public class HeaderCurrentUserProvider implements CurrentUserProvider {

  public static final String USER_ID_HEADER = "X-Debug-User-Id";

  private final HttpServletRequest request;

  public HeaderCurrentUserProvider(HttpServletRequest request) {
    this.request = request;
  }

  @Override
  public UUID currentUserId() {
    String header = request.getHeader(USER_ID_HEADER);
    if (header == null || header.isBlank()) {
      throw new ApiException(HttpStatus.UNAUTHORIZED, "MISSING_USER_ID_HEADER",
          "요청에 " + USER_ID_HEADER + " 헤더가 필요합니다");
    }
    try {
      return UUID.fromString(header);
    } catch (IllegalArgumentException e) {
      throw new ApiException(HttpStatus.UNAUTHORIZED, "INVALID_USER_ID_HEADER",
          USER_ID_HEADER + " 값이 올바른 UUID가 아닙니다");
    }
  }
}
