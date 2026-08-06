import { startNotificationResponseRouting } from '../src/features/notifications/notificationResponseRouting';

function checkInResponse(identifier: string) {
  return {
    notification: {
      request: {
        identifier,
        content: { data: { kind: 'hourly-check-in', url: '/check-in' } },
      },
    },
  };
}

describe('startNotificationResponseRouting', () => {
  it('routes a duplicated last-and-live FootLog response only once and removes its listener', async () => {
    const response = checkInResponse('notification-1');
    let listener: ((value: typeof response) => void) | undefined;
    const remove = jest.fn();
    const source = {
      getLastNotificationResponseAsync: jest.fn(async () => response),
      clearLastNotificationResponseAsync: jest.fn(async () => undefined),
      addNotificationResponseReceivedListener: jest.fn((nextListener) => {
        listener = nextListener;
        return { remove };
      }),
    };
    const navigate = jest.fn();

    const stop = startNotificationResponseRouting(source, navigate);
    listener?.(response);
    await Promise.resolve();
    await Promise.resolve();

    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith('/check-in');
    expect(source.clearLastNotificationResponseAsync).toHaveBeenCalledTimes(1);

    stop();
    expect(remove).toHaveBeenCalledTimes(1);
  });

  it('ignores notification responses that do not match both FootLog routing fields', async () => {
    const response = {
      notification: {
        request: {
          identifier: 'other',
          content: { data: { kind: 'other', url: '/check-in' } },
        },
      },
    };
    const source = {
      getLastNotificationResponseAsync: jest.fn(async () => null),
      clearLastNotificationResponseAsync: jest.fn(async () => undefined),
      addNotificationResponseReceivedListener: jest.fn((listener) => {
        listener(response);
        return { remove: jest.fn() };
      }),
    };
    const navigate = jest.fn();

    startNotificationResponseRouting(source, navigate);
    await Promise.resolve();

    expect(navigate).not.toHaveBeenCalled();
  });
});
