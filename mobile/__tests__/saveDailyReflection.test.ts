import { saveDailyReflection } from '../src/features/daily-reflection/saveDailyReflection';
import type { DailyReflection, DailyReflectionRepository } from '../src/features/daily-reflection/domain';

class FakeDailyReflectionRepository implements DailyReflectionRepository {
  saved: DailyReflection[] = [];
  private byDate = new Map<string, DailyReflection>();

  async getByLocalDate(localDate: string): Promise<DailyReflection | null> {
    return this.byDate.get(localDate) ?? null;
  }

  async save(reflection: DailyReflection): Promise<void> {
    this.saved.push(reflection);
    this.byDate.set(reflection.localDate, reflection);
  }

  async deleteByLocalDate(localDate: string): Promise<void> {
    this.byDate.delete(localDate);
  }
}

describe('saveDailyReflection', () => {
  it('generates a new id when no reflection exists for the date', async () => {
    const repository = new FakeDailyReflectionRepository();

    const result = await saveDailyReflection('2026-08-16', '오늘의 회고', {
      repository,
      uuid: () => 'new-id',
      now: () => '2026-08-16T12:00:00.000Z',
    });

    expect(result).toEqual({ id: 'new-id', localDate: '2026-08-16', body: '오늘의 회고', updatedAt: '2026-08-16T12:00:00.000Z' });
    expect(repository.saved).toEqual([result]);
  });

  it('reuses the existing id when a reflection already exists for the date', async () => {
    const repository = new FakeDailyReflectionRepository();
    await repository.save({ id: 'existing-id', localDate: '2026-08-16', body: '초안', updatedAt: '2026-08-16T09:00:00.000Z' });

    const result = await saveDailyReflection('2026-08-16', '수정된 회고', {
      repository,
      uuid: () => 'should-not-be-used',
      now: () => '2026-08-16T20:00:00.000Z',
    });

    expect(result.id).toBe('existing-id');
    expect(result.body).toBe('수정된 회고');
  });
});
