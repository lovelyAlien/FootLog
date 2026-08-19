export type ActivityWindowPreset = {
  id: string;
  label: string;
  startHour: number;
  endHour: number;
};

export const ACTIVITY_WINDOW_PRESETS: ActivityWindowPreset[] = [
  { id: 'commute', label: '출근형', startHour: 7, endHour: 22 },
  { id: 'free', label: '자유형', startHour: 9, endHour: 23 },
  { id: 'morning', label: '아침형', startHour: 5, endHour: 20 },
];

export function matchPreset(startHour: number, endHour: number): string | null {
  const match = ACTIVITY_WINDOW_PRESETS.find(
    (preset) => preset.startHour === startHour && preset.endHour === endHour,
  );
  return match ? match.id : null;
}
