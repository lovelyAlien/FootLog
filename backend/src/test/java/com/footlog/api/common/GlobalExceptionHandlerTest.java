package com.footlog.api.common;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

import static org.assertj.core.api.Assertions.assertThat;

class GlobalExceptionHandlerTest {

  private final GlobalExceptionHandler handler = new GlobalExceptionHandler();

  @Test
  void mapsApiExceptionToItsStatusAndCode() {
    ApiException ex = new ApiException(HttpStatus.CONFLICT, "CHECK_IN_IMMUTABLE", "체크인은 생성 후 수정할 수 없습니다");

    ResponseEntity<ApiError> response = handler.handleApiException(ex);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.CONFLICT);
    assertThat(response.getBody().code()).isEqualTo("CHECK_IN_IMMUTABLE");
    assertThat(response.getBody().message()).isEqualTo("체크인은 생성 후 수정할 수 없습니다");
  }

  @Test
  void mapsUnreadableRequestBodyToValidationError() {
    ResponseEntity<ApiError> response = handler.handleBadRequest(
        new org.springframework.http.converter.HttpMessageNotReadableException(
            "bad json", (org.springframework.http.HttpInputMessage) null));

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
    assertThat(response.getBody().code()).isEqualTo("VALIDATION_ERROR");
  }
}
