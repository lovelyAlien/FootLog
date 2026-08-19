import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

import { NotificationSettingsScreen } from '../src/features/notifications/NotificationSettingsScreen';
import type { NotificationScheduler } from '../src/features/notifications/ExpoNotificationScheduler';
import type { NotificationSettingsRepository } from '../src/features/settings/AppSettingsRepository';

function createDependencies(options?: { enabled?: boolean; permissionDenied?: boolean; scheduledIds?: string[] }) {
  const settings = {
    enabled: options?.enabled ?? false,
    startHour: 7,
    endHour: 23,
    intervalHours: 1,
    scheduledIds: options?.scheduledIds ?? (options?.enabled ? ['stored-footlog-id'] : []),
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
    refreshIfEnabled: jest.fn(async () => undefined),
  };

  return { repository, scheduler };
}

describe('NotificationSettingsScreen', () => {
  it('starts disabled with the default window, interval, and daily count', async () => {
    const dependencies = createDependencies();
    const view = await render(<NotificationSettingsScreen {...dependencies} />);

    await waitFor(() => expect(view.getByText('07:00 – 23:00')).toBeTruthy());
    expect(view.getByRole('switch', { name: '시간별 체크인 알림' }).props.value).toBe(false);
    expect(view.getByRole('button', { name: '1시간 간격' }).props.accessibilityState.selected).toBe(true);
    expect(view.getByText('하루 17회 알림')).toBeTruthy();
    expect(view.getByText('직접 설정')).toBeTruthy();
    expect(view.queryByRole('button', { name: '알림 시간 저장' })).toBeNull();
  });

  it('enables reminders by rescheduling the current window and interval', async () => {
    const dependencies = createDependencies();
    const view = await render(<NotificationSettingsScreen {...dependencies} />);
    const toggle = await view.findByRole('switch', { name: '시간별 체크인 알림' });

    await act(async () => { fireEvent(toggle, 'valueChange', true); });

    expect(dependencies.scheduler.reschedule).toHaveBeenCalledWith({ startHour: 7, endHour: 23 }, 1);
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

  it('disables reminders through the scheduler so only its stored identifiers are canceled', async () => {
    const dependencies = createDependencies({ enabled: true });
    const view = await render(<NotificationSettingsScreen {...dependencies} />);
    const toggle = await view.findByRole('switch', { name: '시간별 체크인 알림' });

    await act(async () => { fireEvent(toggle, 'valueChange', false); });

    expect(dependencies.scheduler.disable).toHaveBeenCalledWith({ startHour: 7, endHour: 23 });
  });

  it('applies a preset immediately without a separate save step', async () => {
    const dependencies = createDependencies({ enabled: true });
    const view = await render(<NotificationSettingsScreen {...dependencies} />);
    await view.findByText('07:00 – 23:00');

    await act(async () => { fireEvent.press(view.getByRole('button', { name: '아침형' })); });

    expect(dependencies.scheduler.reschedule).toHaveBeenCalledWith({ startHour: 5, endHour: 20 }, 1);
    await waitFor(() => expect(view.getByText('05:00 – 20:00')).toBeTruthy());
    expect(view.getByRole('button', { name: '아침형' }).props.accessibilityState.selected).toBe(true);
    expect(view.queryByText('직접 설정')).toBeNull();
  });

  it('applies an interval change immediately and updates the daily count', async () => {
    const dependencies = createDependencies({ enabled: true });
    const view = await render(<NotificationSettingsScreen {...dependencies} />);
    await view.findByText('07:00 – 23:00');

    await act(async () => { fireEvent.press(view.getByRole('button', { name: '2시간 간격' })); });

    expect(dependencies.scheduler.reschedule).toHaveBeenCalledWith({ startHour: 7, endHour: 23 }, 2);
    await waitFor(() => expect(view.getByText('하루 9회 알림')).toBeTruthy());
  });

  it('applies a slider change (via accessibility increment) immediately', async () => {
    const dependencies = createDependencies({ enabled: true });
    const view = await render(<NotificationSettingsScreen {...dependencies} />);
    await view.findByText('07:00 – 23:00');

    await act(async () => {
      fireEvent(view.getByLabelText('시작 시간'), 'accessibilityAction', { nativeEvent: { actionName: 'increment' } });
    });

    expect(dependencies.scheduler.reschedule).toHaveBeenCalledWith({ startHour: 8, endHour: 23 }, 1);
  });

  it('uses the latest interval when the mount-time slider PanResponder handlers fire after an interval switch', async () => {
    // Regression test: ActivityWindowSlider builds its internal PanResponder via
    // useState(() => createResponder(...)) — a one-time lazy initializer — so the
    // onResponderGrant/onResponderRelease handlers wired to the "종료 시간" thumb are
    // captured here, at mount, and never recreated for the lifetime of the component.
    // We hold onto those mount-time handler references and invoke them directly, exactly
    // as a real drag-release would, after switching the interval, to prove
    // ActivityWindowSlider's own onChangeEndRef (not the screen) is what keeps the
    // eventual scheduler.reschedule call using fresh interval/window state. Driving this
    // through the accessibility path instead would NOT catch a regression here, because
    // ActivityWindowSlider recreates its onAccessibilityAction handler on every render —
    // only the PanResponder path is frozen at mount.
    const dependencies = createDependencies({ enabled: true });
    const view = await render(<NotificationSettingsScreen {...dependencies} />);
    await view.findByText('07:00 – 23:00');

    const endThumb = view.getByLabelText('종료 시간');
    const { onResponderGrant, onResponderRelease } = endThumb.props;

    await act(async () => { fireEvent.press(view.getByRole('button', { name: '2시간 간격' })); });
    dependencies.scheduler.reschedule.mockClear();

    const touchHistory = {
      touchBank: [{
        touchActive: true, currentTimeStamp: 1, currentPageX: 100, currentPageY: 0, previousPageX: 100, previousPageY: 0,
      }],
      numberActiveTouches: 1,
      indexOfSingleActiveTouch: 0,
      mostRecentTimeStamp: 1,
    };
    await act(async () => {
      onResponderGrant({ touchHistory, nativeEvent: {} });
      onResponderRelease({ touchHistory, nativeEvent: {} });
    });

    expect(dependencies.scheduler.reschedule).toHaveBeenCalledWith({ startHour: 7, endHour: 23 }, 2);
  });

  it('persists a changed window while disabled without scheduling', async () => {
    const dependencies = createDependencies({ enabled: false, scheduledIds: ['cleanup-still-needed'] });
    const view = await render(<NotificationSettingsScreen {...dependencies} />);
    await view.findByText('07:00 – 23:00');

    await act(async () => { fireEvent.press(view.getByRole('button', { name: '자유형' })); });

    expect(dependencies.scheduler.reschedule).not.toHaveBeenCalled();
    await waitFor(() => expect(dependencies.repository.setNotificationSettings).toHaveBeenCalledWith({
      enabled: false,
      startHour: 9,
      endHour: 23,
      intervalHours: 1,
      scheduledIds: ['cleanup-still-needed'],
    }));
  });

  it('syncs the switch and displayed window to recovered settings after rescheduling fails', async () => {
    const initialSettings = {
      enabled: true,
      startHour: 7,
      endHour: 23,
      intervalHours: 1,
      scheduledIds: ['stored-footlog-id'],
    };
    const recoveredSettings = {
      enabled: false,
      startHour: 6,
      endHour: 19,
      intervalHours: 1,
      scheduledIds: [],
    };
    const repository: NotificationSettingsRepository = {
      getNotificationSettings: jest.fn()
        .mockResolvedValueOnce(initialSettings)
        .mockResolvedValueOnce(recoveredSettings),
      setNotificationSettings: jest.fn(async () => undefined),
    };
    const scheduler: NotificationScheduler = {
      reschedule: jest.fn(async () => { throw new Error('schedule failed'); }),
      disable: jest.fn(async () => undefined),
      refreshIfEnabled: jest.fn(async () => undefined),
    };
    const view = await render(
      <NotificationSettingsScreen repository={repository} scheduler={scheduler} />,
    );
    await view.findByText('07:00 – 23:00');

    await act(async () => { fireEvent.press(view.getByRole('button', { name: '아침형' })); });

    // The screen optimistically shows the tapped preset (05:00–20:00) before the
    // reschedule call resolves; asserting the *recovered* 06:00–19:00 here proves
    // the failure path re-fetches from the repository instead of trusting the optimistic value.
    await waitFor(() => expect(
      view.getByRole('switch', { name: '시간별 체크인 알림' }).props.value,
    ).toBe(false));
    expect(view.getByText('06:00 – 19:00')).toBeTruthy();
    expect(view.getByText('알림 설정을 바꾸지 못했어요. 잠시 후 다시 시도해 주세요.')).toBeTruthy();
  });
});
