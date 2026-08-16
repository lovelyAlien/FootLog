package com.footlog.api.checkin;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;

import java.util.UUID;

import static org.hamcrest.Matchers.equalTo;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@Testcontainers
class CheckInControllerTest {

  @Container
  static final PostgreSQLContainer<?> postgres =
      new PostgreSQLContainer<>(DockerImageName.parse("postgis/postgis:17-3.5")
          .asCompatibleSubstituteFor("postgres"));

  @DynamicPropertySource
  static void registerDataSourceProperties(DynamicPropertyRegistry registry) {
    registry.add("spring.datasource.url", postgres::getJdbcUrl);
    registry.add("spring.datasource.username", postgres::getUsername);
    registry.add("spring.datasource.password", postgres::getPassword);
  }

  @Autowired WebApplicationContext webApplicationContext;

  private MockMvc mockMvc() {
    return MockMvcBuilders.webAppContextSetup(webApplicationContext).build();
  }

  private String jsonBody() {
    return """
        {
          "latitude": 37.5,
          "longitude": 127.0,
          "accuracyM": 12.5,
          "capturedAt": "2026-08-16T09:00:00Z",
          "checkedInAt": "2026-08-16T09:00:05Z",
          "createdAt": "2026-08-16T09:00:06Z"
        }
        """;
  }

  @Test
  void putCreatesCheckIn() throws Exception {
    UUID userId = UUID.randomUUID();
    UUID checkInId = UUID.randomUUID();

    mockMvc().perform(put("/v1/check-ins/" + checkInId)
            .header("X-Debug-User-Id", userId.toString())
            .contentType(MediaType.APPLICATION_JSON)
            .content(jsonBody()))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.id", equalTo(checkInId.toString())));
  }

  @Test
  void putThenDeleteCheckIn() throws Exception {
    UUID userId = UUID.randomUUID();
    UUID checkInId = UUID.randomUUID();

    mockMvc().perform(put("/v1/check-ins/" + checkInId)
            .header("X-Debug-User-Id", userId.toString())
            .contentType(MediaType.APPLICATION_JSON)
            .content(jsonBody()))
        .andExpect(status().isOk());

    mockMvc().perform(delete("/v1/check-ins/" + checkInId)
            .header("X-Debug-User-Id", userId.toString())
            .contentType(MediaType.APPLICATION_JSON)
            .content("{\"deletedAt\": \"2026-08-16T10:00:00Z\"}"))
        .andExpect(status().isOk());
  }

  @Test
  void missingUserHeaderIsRejected() throws Exception {
    UUID checkInId = UUID.randomUUID();

    mockMvc().perform(put("/v1/check-ins/" + checkInId)
            .contentType(MediaType.APPLICATION_JSON)
            .content(jsonBody()))
        .andExpect(status().isUnauthorized());
  }
}
