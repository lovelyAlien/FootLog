package com.footlog.api.dailyreflection;

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
import static org.hamcrest.Matchers.nullValue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@Testcontainers
class DailyReflectionControllerTest {

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

  @Test
  void putThenDeleteReflection() throws Exception {
    UUID userId = UUID.randomUUID();
    UUID id = UUID.randomUUID();

    String putBody = """
        {
          "date": "2026-08-16",
          "body": "오늘은 걸었다",
          "updatedAt": "2026-08-16T21:00:00Z"
        }
        """;

    mockMvc().perform(put("/v1/daily-reflections/" + id)
            .header("X-Debug-User-Id", userId.toString())
            .contentType(MediaType.APPLICATION_JSON)
            .content(putBody))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.body", equalTo("오늘은 걸었다")))
        .andExpect(jsonPath("$.deletedAt", nullValue()));

    String deleteBody = """
        {
          "deletedAt": "2026-08-16T21:10:00Z"
        }
        """;

    mockMvc().perform(delete("/v1/daily-reflections/" + id)
            .header("X-Debug-User-Id", userId.toString())
            .contentType(MediaType.APPLICATION_JSON)
            .content(deleteBody))
        .andExpect(status().isOk());
  }

  @Test
  void conflictingDateReturns409() throws Exception {
    UUID userId = UUID.randomUUID();

    String firstBody = """
        {
          "date": "2026-08-16",
          "body": "첫 회고",
          "updatedAt": "2026-08-16T21:00:00Z"
        }
        """;

    mockMvc().perform(put("/v1/daily-reflections/" + UUID.randomUUID())
            .header("X-Debug-User-Id", userId.toString())
            .contentType(MediaType.APPLICATION_JSON)
            .content(firstBody))
        .andExpect(status().isOk());

    String secondBody = """
        {
          "date": "2026-08-16",
          "body": "두번째 회고",
          "updatedAt": "2026-08-16T21:05:00Z"
        }
        """;

    mockMvc().perform(put("/v1/daily-reflections/" + UUID.randomUUID())
            .header("X-Debug-User-Id", userId.toString())
            .contentType(MediaType.APPLICATION_JSON)
            .content(secondBody))
        .andExpect(status().isConflict());
  }
}
