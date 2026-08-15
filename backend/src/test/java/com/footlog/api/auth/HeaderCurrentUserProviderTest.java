package com.footlog.api.auth;

import com.footlog.api.common.ApiException;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class HeaderCurrentUserProviderTest {

  @Test
  void readsUserIdFromHeader() {
    UUID userId = UUID.randomUUID();
    MockHttpServletRequest request = new MockHttpServletRequest();
    request.addHeader(HeaderCurrentUserProvider.USER_ID_HEADER, userId.toString());

    HeaderCurrentUserProvider provider = new HeaderCurrentUserProvider(request);

    assertThat(provider.currentUserId()).isEqualTo(userId);
  }

  @Test
  void rejectsMissingHeader() {
    HeaderCurrentUserProvider provider = new HeaderCurrentUserProvider(new MockHttpServletRequest());

    assertThatThrownBy(provider::currentUserId).isInstanceOf(ApiException.class);
  }

  @Test
  void rejectsInvalidUuid() {
    MockHttpServletRequest request = new MockHttpServletRequest();
    request.addHeader(HeaderCurrentUserProvider.USER_ID_HEADER, "not-a-uuid");

    HeaderCurrentUserProvider provider = new HeaderCurrentUserProvider(request);

    assertThatThrownBy(provider::currentUserId).isInstanceOf(ApiException.class);
  }
}
