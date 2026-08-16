package com.footlog.api.sync;

import com.footlog.api.checkin.CheckIn;
import com.footlog.api.checkin.CheckInRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
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

import static org.hamcrest.Matchers.empty;
import static org.hamcrest.Matchers.equalTo;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@Testcontainers
class SyncControllerTest {

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

  @Test
  void returnsOnlyOwnUserChanges() throws Exception {
    UUID userId = UUID.randomUUID();
    UUID otherUserId = UUID.randomUUID();
    Instant now = Instant.parse("2026-08-16T09:00:00Z");
    checkInRepository.upsert(new CheckIn(UUID.randomUUID(), userId, 37.5, 127.0, 15.0, now, now, now, null));
    checkInRepository.upsert(new CheckIn(UUID.randomUUID(), otherUserId, 1.0, 1.0, 15.0, now, now, now, null));

    mockMvc().perform(get("/v1/sync/changes")
            .param("cursor", "0")
            .param("limit", "200")
            .header("X-Debug-User-Id", userId.toString()))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.changes.length()", equalTo(1)))
        .andExpect(jsonPath("$.changes[0].entityType", equalTo("check_in")))
        .andExpect(jsonPath("$.changes[0].operation", equalTo("create")))
        .andExpect(jsonPath("$.changes[0].payload").exists());
  }

  @Test
  void emptyResultForDifferentUser() throws Exception {
    UUID userId = UUID.randomUUID();
    UUID otherUserId = UUID.randomUUID();
    Instant now = Instant.parse("2026-08-16T09:00:00Z");
    checkInRepository.upsert(new CheckIn(UUID.randomUUID(), userId, 37.5, 127.0, 15.0, now, now, now, null));

    mockMvc().perform(get("/v1/sync/changes")
            .param("cursor", "0")
            .param("limit", "200")
            .header("X-Debug-User-Id", otherUserId.toString()))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.changes", empty()))
        .andExpect(jsonPath("$.nextCursor", equalTo(0)));
  }
}
