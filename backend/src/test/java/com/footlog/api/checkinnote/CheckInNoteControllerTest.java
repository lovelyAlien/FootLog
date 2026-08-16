package com.footlog.api.checkinnote;

import com.footlog.api.checkin.CheckIn;
import com.footlog.api.checkin.CheckInRepository;
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

import java.time.Instant;
import java.util.UUID;

import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.nullValue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@Testcontainers
class CheckInNoteControllerTest {

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
  @Autowired CheckInRepository checkInRepository;

  private MockMvc mockMvc() {
    return MockMvcBuilders.webAppContextSetup(webApplicationContext).build();
  }

  private UUID createCheckIn(UUID userId) {
    UUID id = UUID.randomUUID();
    Instant now = Instant.parse("2026-08-16T09:00:00Z");
    checkInRepository.upsert(new CheckIn(id, userId, 37.5, 127.0, 15.0, now, now, now, null));
    return id;
  }

  @Test
  void putThenDeleteNote() throws Exception {
    UUID userId = UUID.randomUUID();
    UUID checkInId = createCheckIn(userId);
    UUID noteId = UUID.randomUUID();

    String putBody = """
        {
          "checkInId": "%s",
          "body": "좋은 카페",
          "updatedAt": "2026-08-16T09:05:00Z"
        }
        """.formatted(checkInId);

    mockMvc().perform(put("/v1/check-in-notes/" + noteId)
            .header("X-Debug-User-Id", userId.toString())
            .contentType(MediaType.APPLICATION_JSON)
            .content(putBody))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.body", equalTo("좋은 카페")))
        .andExpect(jsonPath("$.deletedAt", nullValue()));

    String deleteBody = """
        {
          "deletedAt": "2026-08-16T09:10:00Z"
        }
        """;

    mockMvc().perform(delete("/v1/check-in-notes/" + noteId)
            .header("X-Debug-User-Id", userId.toString())
            .contentType(MediaType.APPLICATION_JSON)
            .content(deleteBody))
        .andExpect(status().isOk());
  }

  @Test
  void noteForMissingCheckInReturns404() throws Exception {
    UUID userId = UUID.randomUUID();
    UUID noteId = UUID.randomUUID();

    String putBody = """
        {
          "checkInId": "%s",
          "body": "메모",
          "updatedAt": "2026-08-16T09:05:00Z"
        }
        """.formatted(UUID.randomUUID());

    mockMvc().perform(put("/v1/check-in-notes/" + noteId)
            .header("X-Debug-User-Id", userId.toString())
            .contentType(MediaType.APPLICATION_JSON)
            .content(putBody))
        .andExpect(status().isNotFound());
  }
}
