import * as Crypto from 'expo-crypto';
import { CheckInScreen } from '../src/features/check-in/CheckInScreen';
import { ExpoLocationGateway } from '../src/features/check-in/ExpoLocationGateway';
import { useFootLogRepository } from '../src/database/FootLogContext';

export default function CheckInRoute() {
  const repository = useFootLogRepository();

  return (
    <CheckInScreen
      deps={{
        locationGateway: new ExpoLocationGateway(),
        repository,
        uuid: Crypto.randomUUID,
        now: () => new Date().toISOString(),
      }}
    />
  );
}
