import { fireEvent, render } from '@testing-library/react-native';

import { ActivityWindowSlider } from '../src/features/notifications/ActivityWindowSlider';

describe('ActivityWindowSlider', () => {
  it('shows the current window as accessibility values', async () => {
    const view = await render(
      <ActivityWindowSlider startHour={7} endHour={23} disabled={false} onChangeEnd={jest.fn()} />,
    );

    expect(view.getByLabelText('시작 시간').props.accessibilityValue).toEqual({ text: '07:00' });
    expect(view.getByLabelText('종료 시간').props.accessibilityValue).toEqual({ text: '23:00' });
  });

  it('increments the start hour and reports the new window', async () => {
    const onChangeEnd = jest.fn();
    const view = await render(
      <ActivityWindowSlider startHour={7} endHour={23} disabled={false} onChangeEnd={onChangeEnd} />,
    );

    await fireEvent(view.getByLabelText('시작 시간'), 'accessibilityAction', { nativeEvent: { actionName: 'increment' } });

    expect(onChangeEnd).toHaveBeenCalledWith({ startHour: 8, endHour: 23 });
  });

  it('decrements the end hour and reports the new window', async () => {
    const onChangeEnd = jest.fn();
    const view = await render(
      <ActivityWindowSlider startHour={7} endHour={23} disabled={false} onChangeEnd={onChangeEnd} />,
    );

    await fireEvent(view.getByLabelText('종료 시간'), 'accessibilityAction', { nativeEvent: { actionName: 'decrement' } });

    expect(onChangeEnd).toHaveBeenCalledWith({ startHour: 7, endHour: 22 });
  });

  it('does not let the start hour cross the end hour', async () => {
    const onChangeEnd = jest.fn();
    const view = await render(
      <ActivityWindowSlider startHour={9} endHour={10} disabled={false} onChangeEnd={onChangeEnd} />,
    );

    await fireEvent(view.getByLabelText('시작 시간'), 'accessibilityAction', { nativeEvent: { actionName: 'increment' } });

    expect(onChangeEnd).toHaveBeenCalledWith({ startHour: 9, endHour: 10 });
  });

  it('ignores accessibility actions while disabled', async () => {
    const onChangeEnd = jest.fn();
    const view = await render(
      <ActivityWindowSlider startHour={7} endHour={23} disabled onChangeEnd={onChangeEnd} />,
    );

    await fireEvent(view.getByLabelText('시작 시간'), 'accessibilityAction', { nativeEvent: { actionName: 'increment' } });

    expect(onChangeEnd).not.toHaveBeenCalled();
  });
});
