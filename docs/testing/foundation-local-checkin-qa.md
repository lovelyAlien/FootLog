# Foundation + Local Check-in QA

## 검증 상태

- 상태: **조건부 완료 — iOS Simulator 검증 완료, 실제 iPhone·Android 검증 보류**
- 검증 일시: 2026-08-09 (Asia/Seoul)
- Task 9 시작/base 커밋: `b2b6a533b5afb5d654637c9bcbe488548c05e993`
- 자동 검사 대상 코드 커밋: `c4441c5c0c114c0aa44171bea8bc2f2edb81508c`
- 최초 QA 문서 커밋: `d634816a772e6bd8e3d11316589077c21deb8fc8`
- 모바일 런타임: Node.js `v24.19.0`, npm `11.17.0`
- 백엔드 대상 런타임: JDK `21.0.6`, Gradle Wrapper `8.14.4`

현재 환경에서 수행 가능한 iOS Simulator 기능 흐름과 재시작 보존, 알림 탭 라우팅을 확인해 이 슬라이스를 조건부 완료로 마감한다. 최소 한 대의 실제 iPhone 검증과 Android 검증은 환경이 준비될 때 수행할 후속 검증으로 보류하며, 아래 체크리스트는 의도적으로 미완료 상태를 유지한다.

## 재현 명령과 실제 결과

### 모바일 자동 검사

`mobile` 디렉터리에서 Node.js 24로 실행했다.

| 명령 | 종료 코드 | 실제 결과 |
| --- | ---: | --- |
| `npm test -- --runInBand` | 0 | 15/15 test suites, 69/69 tests 통과 |
| `npm run typecheck` | 0 | TypeScript 오류 없음 |
| `npm run lint` | 0 | lint 오류 없음 |
| `npx expo-doctor` | 0 | 온라인 실행에서 20/20 검사 통과 |

SDK 57 권장 버전으로 정렬된 패키지:

- `@types/jest`: `29.5.14`
- `expo`: `~57.0.11`
- `expo-location`: `~57.0.8`
- `expo-notifications`: `~57.0.9`
- `expo-router`: `~57.0.11`
- `expo-symbols`: `~57.0.2`

`package.json`과 lockfile이 함께 갱신됐다. `npx expo install --check`는 로컬 SDK map 기준 “Dependencies are up to date”와 종료 코드 0을 반환했고, 이후 온라인 `expo-doctor`에서도 기존 여섯 dependency mismatch가 모두 해소됐다.

CocoaPods `1.17.0` 설치 후 온라인 Expo Doctor의 native tooling 검사를 포함한 전체 검사가 통과했다.

재검증 명령:

```bash
cd mobile
nvm use 24
npm test
npm run typecheck
npm run lint
npx expo-doctor
```

### 백엔드 자동 검사

| 명령 | 상태 | 실제 결과 |
| --- | --- | --- |
| `./gradlew test --rerun-tasks` | 통과 | Gradle 8.14.4, JDK 21에서 4개 task 모두 실제 실행, build 성공 |
| `./gradlew bootJar --rerun-tasks` | 통과 | 4개 task 모두 실제 실행, build 성공 |

최초 sandbox 실행은 `~/.gradle` wrapper lock 생성 권한이 없어 build 시작 전에 실패했다. 권한이 허용된 환경에서 Gradle 8.14.4를 받은 뒤 exact `./gradlew test`와 `./gradlew bootJar`가 성공했고, 캐시 효과를 배제한 `--rerun-tasks` 실행도 각각 성공했다.

Task 8의 기존 통과 증거와 별개로 Task 9에서 fresh backend verification을 완료했다.

### 개발 클라이언트

| 플랫폼 | 명령 | 상태 | 실제 결과 / blocker |
| --- | --- | --- | --- |
| iOS Simulator | `npx expo run:ios --no-bundler` | 검증 | Node.js 24와 CocoaPods 1.17.0으로 Pods 설치 및 Xcode build 성공(0 errors, 2 warnings). iPhone 17 Pro Simulator에 `FootLog.app` 설치 후 `com.footlog.app` 실행 성공. CLI의 Metro 8081 연결 대기는 build/install/open 확인 후 Ctrl-C로 종료했으며 종료 코드 0. |
| Android | `npx expo run:android` | 미검증 | 기본 Android SDK 경로(`/Users/lovelyalien/Library/Android/sdk`)가 없고 `ANDROID_HOME`이 설정되지 않았으며 `adb` 실행 파일도 없다. |

iOS Simulator 개발 빌드·설치·실행은 검증했다. Android와 실제 iPhone은 검증하지 않았으며, completion gate의 실제 기기 증거로 Simulator 결과를 대신 사용하지 않는다.

### iOS Simulator 기능 검증

iPhone 17 Pro Simulator(iOS 26.5)의 Release 빌드에서 다음을 확인했다.

- 앱 사용 중 위치 권한만 허용하고 시뮬레이션 좌표(37.5665, 126.9780)를 조회했다.
- 위치 준비 후 지도 핀, 약 5m 정확도, 다시 찾기, 명시적 체크인 버튼이 표시됐다.
- 체크인은 UUID와 좌표, 정확도, `pending` 동기화 상태로 기기 SQLite에 먼저 저장됐다.
- 앱 강제 종료 후 다시 실행해도 오늘 목록과 SQLite 행이 유지됐다.
- 알림 시간 범위를 저장했고 예약 식별자들이 로컬 설정과 함께 유지됐다.
- 활성화된 다음 2일 예약은 앱 시작과 foreground 복귀 때 직렬화된 reconciliation으로 갱신된다. 예약 생성 후 rollback 취소에 실패한 ID는 다음 정리 시도를 위해 보존된다.
- `simctl push`로 알림 응답을 주입하고 배너를 탭했을 때 `/check-in` 화면으로 이동했다. Expo iOS가 원격 알림 사용자 데이터를 `body` 딕셔너리에서 역직렬화하므로 Simulator 테스트 payload도 같은 구조를 사용했다.

이 검증은 Simulator의 고정 좌표와 APNs 주입을 사용했다. 실제 GPS, 실제 예약 시각에 발생한 로컬 알림, 물리 기기의 권한 프롬프트를 입증하는 증거로 간주하지 않는다.

## 정적 검사와 clean prebuild 결과

- 앱 위치 gateway 소스는 `requestForegroundPermissionsAsync()`와 `getCurrentPositionAsync()`만 사용하며 background location API를 호출하지 않는다.
- `expo-location` 플러그인에 Always 설명 두 개와 iOS/Android background location을 모두 명시적으로 `false`로 설정했다.
- `CI=1 npx expo prebuild --platform ios --clean --no-install`은 종료 코드 0이었고, 새 `ios/FootLog/Info.plist`에는 `NSLocationWhenInUseUsageDescription`만 존재한다. 두 Always 키와 `UIBackgroundModes location`은 없다.
- config introspection 테스트가 같은 native permission 결과를 검증한다.
- 완료 화면의 `오늘의 발자국 보기`는 주입된 callback을 호출하고, route가 이를 Expo Router의 `/`로 연결한다. component test는 완료 직후 자동 이동이 없고 버튼 press 후 callback이 정확히 한 번 호출됨을 검증한다.
- 코드상 로컬 알림 payload와 응답 라우터는 `/check-in`을 사용한다. 알림 응답은 앱 초기화 전에 수신해도 보관했다가 DB와 root navigation이 준비된 뒤 이동하며, cold-start component test와 Simulator 알림 탭 검증을 통과했다.
- Expo Router가 `src/app`을 `app`보다 우선 선택해 Release 번들에 starter 화면이 포함되는 문제를 발견했다. 중복 starter route와 미사용 starter 구성 요소를 제거하고 실제 router directory가 `app`인지 검사하는 회귀 테스트를 추가했다.

## 실제 기기 체크리스트

아래 항목은 실제 기기에서 검증하지 않았으며 의도적으로 모두 미체크 상태로 둔다.

- [ ] 첫 실행에서 앱 사용 중 위치 권한만 요청한다.
- [ ] 위치 확인 중에는 저장 버튼이 활성화되지 않는다.
- [ ] 위치 준비 후 핀과 정확도 반경이 표시된다.
- [ ] 저장 전에는 오늘 목록에 행이 생성되지 않는다.
- [ ] 다시 찾기는 위치만 갱신하고 저장하지 않는다.
- [ ] 이 위치에 체크인을 누르면 오프라인에서도 완료된다.
- [ ] 완료 화면에서 강제 이동하지 않는다.
- [ ] 오늘의 발자국 보기로 오늘 목록을 확인할 수 있다.
- [ ] 앱 재시작 후에도 체크인이 남아 있다.
- [ ] 로컬 알림을 누르면 체크인 화면이 열린다.
- [ ] 알림 거부 후에도 지금 체크인을 사용할 수 있다.
- [ ] iOS에서 Always 권한 문구가 나타나지 않는다.
- [ ] Android에서 백그라운드 위치 권한이 나타나지 않는다.

## 재검증 순서

1. 실제 iPhone에 development client를 빌드·설치하고 실행한다.
2. Android SDK, `ANDROID_HOME`, `adb`, Emulator 또는 실제 Android 기기를 준비해 `npx expo run:android`를 실행한다.
3. 실제 기기에서 네트워크를 끈 상태의 체크인과 앱 재시작 보존, 실제 로컬 알림 탭과 권한 프롬프트를 포함해 위 체크리스트를 수행한다.
