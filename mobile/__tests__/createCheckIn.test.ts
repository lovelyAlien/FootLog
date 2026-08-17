import { createCheckIn } from '../src/features/check-in/createCheckIn';
import type { CheckIn, CheckInRepository } from '../src/features/check-in/domain';

class FakeCheckInRepository implements CheckInRepository {
  saved: CheckIn[] = [];

  async save(checkIn: CheckIn): Promise<void> {
    this.saved.push(checkIn);
  }

  async listByLocalDay(): Promise<CheckIn[]> {
    return [];
  }

  async deleteById(): Promise<void> {}

  async listLocalDatesWithCheckIns(): Promise<string[]> {
    return [];
  }
}

describe('createCheckIn', () => {
  it('persists a pending check-in at confirmation time', async () => {
    const repository = new FakeCheckInRepository();
    const fix = {
      latitude: 37.5445,
      longitude: 127.056,
      accuracyM: 42,
      capturedAt: '2026-08-06T00:00:00.000Z',
    };

    const checkIn = await createCheckIn(fix, {
      repository,
      uuid: () => '11111111-1111-4111-8111-111111111111',
      now: () => '2026-08-06T00:00:03.000Z',
    });

    const expected: CheckIn = {
      id: '11111111-1111-4111-8111-111111111111',
      latitude: 37.5445,
      longitude: 127.056,
      accuracyM: 42,
      capturedAt: '2026-08-06T00:00:00.000Z',
      checkedInAt: '2026-08-06T00:00:03.000Z',
      createdAt: '2026-08-06T00:00:03.000Z',
      syncStatus: 'pending',
    };

    expect(repository.saved).toEqual([expected]);
    expect(checkIn).toEqual(expected);
  });
});
