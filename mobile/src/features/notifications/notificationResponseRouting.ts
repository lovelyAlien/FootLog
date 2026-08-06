type NotificationResponseLike = {
  notification: {
    request: {
      identifier: string;
      content: {
        data?: Record<string, unknown>;
      };
    };
  };
};

type NotificationResponseSource = {
  getLastNotificationResponseAsync(): Promise<NotificationResponseLike | null>;
  clearLastNotificationResponseAsync(): Promise<void>;
  addNotificationResponseReceivedListener(
    listener: (response: NotificationResponseLike) => void,
  ): { remove(): void };
};

export function startNotificationResponseRouting(
  source: NotificationResponseSource,
  navigate: (url: '/check-in') => void,
): () => void {
  let active = true;
  const handledIdentifiers = new Set<string>();

  const handleResponse = (response: NotificationResponseLike | null) => {
    if (!active || !response) return;

    const { identifier, content } = response.notification.request;
    if (handledIdentifiers.has(identifier)) return;

    const data = content.data ?? {};
    if (data.kind !== 'hourly-check-in' || data.url !== '/check-in') return;

    handledIdentifiers.add(identifier);
    navigate('/check-in');
  };

  // Subscribe first so a response arriving while the last response is read is not lost.
  const subscription = source.addNotificationResponseReceivedListener(handleResponse);
  void (async () => {
    try {
      const response = await source.getLastNotificationResponseAsync();
      if (!active) return;
      handleResponse(response);
      if (response) await source.clearLastNotificationResponseAsync();
    } catch {
      // Routing should never prevent the rest of the app from initializing.
    }
  })();

  return () => {
    active = false;
    subscription.remove();
  };
}
