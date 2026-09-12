/** Bir tabda chiqilganda boshqa ochiq tablar ham darhol chiqadi. */
interface AuthEvent {
  type: 'logout';
}

const channel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel('crm-auth');

function isAuthEvent(value: unknown): value is AuthEvent {
  return typeof value === 'object' && value !== null && 'type' in value && value.type === 'logout';
}

export function broadcastLogout(): void {
  const event: AuthEvent = { type: 'logout' };
  channel?.postMessage(event);
}

export function subscribeToLogout(onLogout: () => void): () => void {
  if (!channel) return () => undefined;
  const handler = (event: MessageEvent<unknown>) => {
    if (isAuthEvent(event.data)) onLogout();
  };
  channel.addEventListener('message', handler);
  return () => channel.removeEventListener('message', handler);
}
