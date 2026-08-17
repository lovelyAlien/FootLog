export type DailyReflection = {
  id: string;
  localDate: string;
  body: string;
  updatedAt: string;
};

export interface DailyReflectionRepository {
  getByLocalDate(localDate: string): Promise<DailyReflection | null>;
  save(reflection: DailyReflection): Promise<void>;
  deleteByLocalDate(localDate: string): Promise<void>;
}

export interface DailyReflectionDraftRepository {
  getDraft(localDate: string): Promise<string | null>;
  saveDraft(localDate: string, body: string): Promise<void>;
  clearDraft(localDate: string): Promise<void>;
}
