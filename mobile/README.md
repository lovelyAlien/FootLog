# FootLog Mobile

FootLog의 React Native·Expo 모바일 앱이다. 체크인은 위치를 확인한 뒤 기기 SQLite에 먼저 저장하며, 시간별 체크인 알림은 기기 로컬 알림으로 예약한다.

## 개발 환경

- Node.js 24
- npm 11
- Xcode와 CocoaPods(iOS)
- Android SDK와 adb(Android)

## 주요 명령

```bash
npm install
npm start
npm run ios
npm run android
```

자동 검증:

```bash
npm test
npm run typecheck
npm run lint
npx expo-doctor
```

Expo Router는 루트 `app/` 디렉터리를 사용한다. 제품 route와 충돌할 수 있으므로 별도의 `src/app/` route tree를 만들지 않는다.

위치 권한은 앱 사용 중 권한만 요청한다. 백그라운드 위치 추적이나 iOS Always 권한을 추가하지 않는다.
