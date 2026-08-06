import * as Crypto from 'expo-crypto';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { CheckInScreen } from '../src/features/check-in/CheckInScreen';
import { ExpoLocationGateway } from '../src/features/check-in/ExpoLocationGateway';
import { SQLiteCheckInRepository } from '../src/features/check-in/SQLiteCheckInRepository';
import type { CheckInRepository } from '../src/features/check-in/domain';
import { openFootLogDatabase } from '../src/database/openDatabase';

export default function CheckInRoute() {
  const [repository, setRepository] = useState<CheckInRepository>();

  useEffect(() => {
    void openFootLogDatabase().then((database) => {
      setRepository(new SQLiteCheckInRepository(database));
    });
  }, []);

  if (!repository) return <View />;

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
