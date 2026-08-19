import * as Crypto from 'expo-crypto';
import { useRouter } from 'expo-router';
import { CheckInScreen } from '../src/features/check-in/CheckInScreen';
import { ExpoLocationGateway } from '../src/features/check-in/ExpoLocationGateway';
import { useFootLogRepository } from '../src/database/FootLogContext';
import { localDateAndTimezone } from '../src/shared/localDate';

export default function CheckInRoute() {
  const repository = useFootLogRepository();
  const router = useRouter();

  return (
    <CheckInScreen
      deps={{
        locationGateway: new ExpoLocationGateway(),
        repository,
        uuid: Crypto.randomUUID,
        now: () => new Date().toISOString(),
      }}
      onViewToday={() => router.replace({ pathname: '/day/[date]', params: { date: localDateAndTimezone().localDate } })}
      onCancel={() => router.back()}
    />
  );
}
