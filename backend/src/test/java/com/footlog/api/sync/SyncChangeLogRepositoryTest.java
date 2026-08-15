package com.footlog.api.sync;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest
@Testcontainers
class SyncChangeLogRepositoryTest {

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

  @Autowired SyncChangeLogRepository repository;

  @Test
  void appendsAndListsSinceCursorForOwningUserOnly() {
    UUID userId = UUID.randomUUID();
    UUID otherUserId = UUID.randomUUID();
    UUID entityId = UUID.randomUUID();
    Instant now = Instant.parse("2026-08-16T09:00:00Z");

    repository.append(userId, "check_in", entityId, "create", Map.of("latitude", 37.5), now);
    repository.append(otherUserId, "check_in", UUID.randomUUID(), "create", Map.of("latitude", 1.0), now);

    List<SyncChangeRow> rows = repository.listSince(userId, 0, 200);

    assertThat(rows).hasSize(1);
    assertThat(rows.get(0).entityId()).isEqualTo(entityId);
    assertThat(rows.get(0).operation()).isEqualTo("create");
    assertThat(rows.get(0).payloadJson()).contains("37.5");
  }

  @Test
  void deleteOperationsAllowNullPayload() {
    UUID userId = UUID.randomUUID();
    UUID entityId = UUID.randomUUID();
    Instant now = Instant.parse("2026-08-16T09:00:00Z");

    repository.append(userId, "check_in", entityId, "delete", null, now);

    List<SyncChangeRow> rows = repository.listSince(userId, 0, 200);

    assertThat(rows).hasSize(1);
    assertThat(rows.get(0).payloadJson()).isNull();
  }
}
