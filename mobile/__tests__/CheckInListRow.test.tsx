import { fireEvent, render } from '@testing-library/react-native';

import { CheckInListRow } from '../src/features/check-in/CheckInListRow';
import type { CheckIn } from '../src/features/check-in/domain';
import { colors } from '../src/shared/theme';

const checkIn: CheckIn = {
  id: 'c1',
  checkedInAt: '2026-08-06T00:15:00.000Z',
  capturedAt: '2026-08-06T00:14:58.000Z',
  latitude: 37.5,
  longitude: 127.0,
  accuracyM: 12,
  createdAt: '2026-08-06T00:15:00.000Z',
  syncStatus: 'pending',
};

describe('CheckInListRow', () => {
  it('shows the local time and rounded accuracy', async () => {
    const view = await render(<CheckInListRow checkIn={checkIn} isSelected={false} onPress={jest.fn()} />);

    expect(view.getByTestId('check-in-time').props.children).toBe('09:15');
    expect(view.getByText('정확도 약 12m')).toBeTruthy();
  });

  it('applies the selected style when isSelected is true', async () => {
    const view = await render(<CheckInListRow checkIn={checkIn} isSelected onPress={jest.fn()} />);

    const flattenedStyle = [view.getByTestId('today-map-list-c1').props.style].flat();
    expect(flattenedStyle).toEqual(expect.arrayContaining([expect.objectContaining({ borderColor: colors.primary })]));
  });

  it('calls onPress with the check-in id when tapped', async () => {
    const onPress = jest.fn();
    const view = await render(<CheckInListRow checkIn={checkIn} isSelected={false} onPress={onPress} />);

    await fireEvent.press(view.getByTestId('today-map-list-c1'));
    expect(onPress).toHaveBeenCalledWith('c1');
  });
});
