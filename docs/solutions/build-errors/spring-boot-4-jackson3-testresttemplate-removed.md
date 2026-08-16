---
title: Spring Boot 4.1 pins Jackson 3 and drops TestRestTemplate
date: 2026-08-16
category: build-errors
module: backend
problem_type: build_error
component: tooling
symptoms:
  - "package com.fasterxml.jackson.databind does not exist 컴파일 오류"
  - "TestRestTemplate 클래스를 찾을 수 없어 컨트롤러 통합 테스트가 컴파일되지 않음"
root_cause: wrong_api
resolution_type: code_fix
severity: medium
related_components:
  - testing_framework
tags: [spring-boot, jackson, testresttemplate, mockmvc, dependency-version]
---

# Spring Boot 4.1 pins Jackson 3 and drops TestRestTemplate

## Problem

`backend/build.gradle`이 `org.springframework.boot` 플러그인 버전을 `4.1.0`으로 고정하고 있는데, 이는 이 세션이 구현 계획을 작성한 시점에 익숙했던 Spring Boot 2/3 시대의 관례(Jackson 2 패키지 경로, `TestRestTemplate`)와 호환되지 않는다. 계획서에 적힌 코드를 그대로 트랜스크립션하면 두 지점에서 컴파일이 실패한다.

## Symptoms

- `ObjectMapper`/`JsonNode`를 `com.fasterxml.jackson.databind.*`에서 import하면 `error: package com.fasterxml.jackson.databind does not exist` — 이 패키지 자체가 클래스패스에 없다(`com.fasterxml.jackson.annotations`만 호환용으로 남아있음).
- 컨트롤러 통합 테스트에서 `org.springframework.boot.test.web.client.TestRestTemplate`을 참조하면 `cannot find symbol` — `spring-boot-test:4.1.0` 아티팩트 자체에서 클래스가 삭제되었다.

## What Didn't Work

- 처음 작성한 구현 계획(`docs/superpowers/plans/2026-08-16-sync-domain-backend-implementation.md`)은 Spring Boot 4.1.0이라는 버전 문자열만 확인하고, 실제 의존성 트리를 검증하지 않은 채 익숙한 Jackson 2/`TestRestTemplate` API를 코드에 그대로 포함시켰다.

## Solution

**Jackson**: `tools.jackson.databind.ObjectMapper` / `tools.jackson.databind.JsonNode`로 import한다(Jackson 3.x). API 시그니처(`ObjectMapper.writeValueAsString(Object)`, `.readTree(String)`)는 동일하므로 import 경로만 바뀐다. 단, 예외 타입이 Jackson 2의 checked `JsonProcessingException`에서 Jackson 3의 unchecked `JacksonException`으로 바뀌었으니 `catch (Exception e)` 같은 넓은 캐치가 여전히 유효한지 확인한다.

```java
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.JsonNode;
```

**컨트롤러 통합 테스트**: `TestRestTemplate` 대신 `MockMvc`를 쓴다.

```java
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@Testcontainers
class SomeControllerTest {
  @Autowired WebApplicationContext webApplicationContext;

  private MockMvc mockMvc() {
    return MockMvcBuilders.webAppContextSetup(webApplicationContext).build();
  }

  @Test
  void example() throws Exception {
    mockMvc().perform(put("/v1/resource/" + id)
            .header("X-Debug-User-Id", userId.toString())
            .contentType(MediaType.APPLICATION_JSON)
            .content(jsonBody))
        .andExpect(status().isOk());
  }
}
```
(예시: `backend/src/test/java/com/footlog/api/checkin/CheckInControllerTest.java`)

## Why This Works

`spring-boot-starter-web`이 이 프로젝트에서 실제로 해석하는 것은 `spring-boot-starter-jackson:4.1.0` → `tools.jackson.core:jackson-databind:3.1.4`이다(`com.fasterxml.jackson.core:jackson-databind`는 클래스패스에 전혀 없음 — `./gradlew dependencies --configuration compileClasspath`로 확인 가능). `MockMvc`는 `WebApplicationContext`에서 직접 구성되므로 실제 서블릿 스택·`GlobalExceptionHandler`·리포지토리·실제 DB를 그대로 거치면서도 존재하지 않는 클래스에 의존하지 않는다.

## Prevention

- 이 저장소의 `backend/build.gradle`에 고정된 Spring Boot/의존성 버전이 통상적으로 익숙한 버전보다 앞서 있다면, 관련 코드를 작성하기 전에 `./gradlew dependencies --configuration testCompileClasspath`로 실제 해석된 아티팩트를 먼저 확인한다.
- 이 프로젝트에서 Jackson을 직접 다룰 때는 `tools.jackson.databind.*`를 쓴다.
- 이 프로젝트에서 컨트롤러 통합 테스트는 `MockMvc`를 쓴다(`CheckInControllerTest.java`가 확립된 예시 패턴).
- 검증: `cd backend && JAVA_HOME=$(/usr/libexec/java_home -v 21) ./gradlew test` 전체 스위트 55개 테스트 통과(무회귀).

## Related Issues

- `docs/superpowers/plans/2026-08-16-sync-domain-backend-implementation.md`의 Global Constraints 섹션에도 동일 내용이 "[실행 중 발견]" 표시로 기록되어 있다.
