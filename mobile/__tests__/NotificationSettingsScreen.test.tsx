import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

import { NotificationSettingsScreen } from '../src/features/notifications/NotificationSettingsScreen';
import type { NotificationScheduler } from '../src/features/notifications/ExpoNotificationScheduler';
import type { NotificationSettingsRepository } from '../src/features/settings/AppSettingsRepository';

function createDependencies(options?: { enabled?: boolean; permissionDenied?: boolean }) {
  const settings = {
    enabled: options?.enabled ?? false,
    startHour: 7,
    endHour: 23,
    scheduledIds: options?.enabled ? ['stored-footlog-id'] : [],
  };
  const repository: NotificationSettingsRepository & { setNotificationSettings: jest.Mock } = {
    getNotificationSettings: jest.fn(async () => settings),
    setNotificationSettings: jest.fn(async () => undefined),
  };
  const scheduler: NotificationScheduler & { reschedule: jest.Mock; disable: jest.Mock } = {
    reschedule: jest.fn(async () => options?.permissionDenied
      ? { status: 'denied' as const }
      : { status: 'scheduled' as const, scheduledIds: ['new-footlog-id'] }),
    disable: jest.fn(async () => undefined),
  };

  return { repository, scheduler };
}

describe('NotificationSettingsScreen', () => {
  it('starts disabled with the default 07:00–23:00 activity window', async () => {
    const dependencies = createDependencies();
    const view = await render(<NotificationSettingsScreen {...dependencies} />);

    await waitFor(() => expect(view.getByText('07:00–23:00')).toBeTruthy());
    expect(view.getByRole('switch', { name: '시간별 체크인 알림' }).props.value).toBe(false);
  });

  it('enables reminders by rescheduling the selected activity window', async () => {
    const dependencies = createDependencies();
    const view = await render(<NotificationSettingsScreen {...dependencies} />);
    const toggle = await view.findByRole('switch', { name: '시간별 체크인 알림' });

    await act(async () => { fireEvent(toggle, 'valueChange', true); });

    expect(dependencies.scheduler.reschedule).toHaveBeenCalledWith({ startHour: 7, endHour: 23 });
    await waitFor(() => expect(view.getByRole('switch', { name: '시간별 체크인 알림' }).props.value).toBe(true));
  });

  it('returns the switch to off and explains how to recover after permission denial', async () => {
    const dependencies = createDependencies({ permissionDenied: true });
    const view = await render(<NotificationSettingsScreen {...dependencies} />);
    const toggle = await view.findByRole('switch', { name: '시간별 체크인 알림' });

    await act(async () => { fireEvent(toggle, 'valueChange', true); });

    await waitFor(() => expect(view.getByRole('switch', { name: '시간별 체크인 알림' }).props.value).toBe(false));
    expect(view.getByText(/알림 권한이 꺼져 있어요/)).toBeTruthy();
  });

  it('rebuilds schedules after saving a changed hour while enabled', async () => {
    const dependencies = createDependencies({ enabled: true });
    const view = await render(<NotificationSettingsScreen {...dependencies} />);
    await view.findByText('07:00–23:00');

    await fireEvent.press(view.getByRole('button', { name: '시작 시간 08:00' }));
    await fireEvent.press(view.getByRole('button', { name: '알림 시간 저장' }));

    await waitFor(() => expect(dependencies.scheduler.reschedule).toHaveBeenCalledWith({
      startHour: 8,
      endHour: 23,
    }));
  });

  it('disables reminders through the scheduler so only its stored identifiers are canceled', async () => {
    const dependencies = createDependencies({ enabled: true });
    const view = await render(<NotificationSettingsScreen {...dependencies} />);
    const toggle = await view.findByRole('switch', { name: '시간별 체크인 알림' });

    await act(async () => { fireEvent(toggle, 'valueChange', false); });

    expect(dependencies.scheduler.disable).toHaveBeenCalledWith({ startHour: 7, endHour: 23 });
  });

  it('blocks saving an invalid activity window and shows guidance', async () => {
    const dependencies = createDependencies();
    const view = await render(<NotificationSettingsScreen {...dependencies} />);
    await view.findByText('07:00–23:00');

    await fireEvent.press(view.getByRole('button', { name: '시작 시간 23:00' }));

    expect(view.getByText('종료 시간은 시작 시간보다 늦어야 해요')).toBeTruthy();
    expect(view.getByRole('button', { name: '알림 시간 저장' }).props.accessibilityState.disabled).toBe(true);
  });

  it('still disables enabled reminders with the saved window when the draft is invalid', async () => {
    const dependencies = createDependencies({ enabled: true });
    const view = await render(<NotificationSettingsScreen {...dependencies} />);
    await view.findByText('07:00–23:00');

    await fireEvent.press(view.getByRole('button', { name: '시작 시간 23:00' }));
    const toggle = view.getByRole('switch', { name: '시간별 체크인 알림' });
    await act(async () => { fireEvent(toggle, 'valueChange', false); });

    expect(dependencies.scheduler.disable).toHaveBeenCalledWith({ startHour: 7, endHour: 23 });
    await waitFor(() => expect(view.getByRole('switch', { name: '시간별 체크인 알림' }).props.value).toBe(false));
  });
});
