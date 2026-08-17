export type LocationFix = {
  latitude: number;
  longitude: number;
  accuracyM: number;
  capturedAt: string;
};

export class LocationFixError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LocationFixError';
  }
}

export type CheckIn = LocationFix & {
  id: string;
  checkedInAt: string;
  createdAt: string;
  syncStatus: 'pending';
};

export interface LocationGateway {
  requestForegroundPermission(): Promise<'granted' | 'denied'>;
  getCurrentFix(): Promise<LocationFix>;
}

export interface CheckInRepository {
  save(checkIn: CheckIn): Promise<void>;
  listByLocalDay(localDate: string, timezone: string): Promise<CheckIn[]>;
  deleteById(id: string): Promise<void>;
  listLocalDatesWithCheckIns(year: number, month: number, timezone: string): Promise<string[]>;
}
