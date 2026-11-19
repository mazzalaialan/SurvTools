import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/core/db/db';
import { useSettings } from '@/core/settings/settings';
import { canShowLocal, notificationBackend, setNotificationBackend, webBackend, type NotificationBackend } from './backend';
import { deleteServerAccount, disableNotifications, enableNotifications, sendTestNotification, ServerError } from './notifications';
import { readNotificationState, updateNotificationState } from './state';

const SERVER = 'https://vikarg.example';

/** Una implementación falsa: anota qué se le pidió, sin service worker ni navegador. */
function fakeBackend(over: Partial<NotificationBackend> = {}): NotificationBackend & { calls: string[] } {
  const calls: string[] = [];
  const note = <T>(name: string, value: T) => async () => {
    calls.push(name);
    return value;
  };
  return {
    calls,
    supported: () => true,
    requestPermission: note('permission', true),
    registerDaily: note('registerDaily', true),
    unregisterDaily: note('unregisterDaily', undefined),
    subscribePush: async () => {
      calls.push('subscribe');
      return { endpoint: 'https://push.example/abc', keys: { p256dh: 'p', auth: 'a' } };
    },
    unsubscribePush: note('unsubscribe', undefined),
    permission: () => 'granted',
    showLocal: async (n) => void calls.push(`local:${n.title}`),
    shownByTag: async () => null,
    ...over,
  };
}

describe('notificaciones con una implementación intercambiable', () => {
  let previous: NotificationBackend;
  const fetchMock = vi.fn();
  beforeEach(async () => {
    previous = notificationBackend();
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    await db.meta.clear();
    useSettings.setState({ settings: { ...useSettings.getState().settings, serverUrl: '', notificationsEnabled: false } });
  });
  afterEach(() => {
    setNotificationBackend(previous);
    vi.unstubAllGlobals();
  });

  it('canShowLocal exige soporte y permiso concedido', () => {
    setNotificationBackend(fakeBackend({ permission: () => 'granted' }));
    expect(canShowLocal()).toBe(true);
    setNotificationBackend(fakeBackend({ permission: () => 'denied' }));
    expect(canShowLocal()).toBe(false);
    setNotificationBackend(fakeBackend({ supported: () => false }));
    expect(canShowLocal()).toBe(false);
  });

  it('por defecto es la implementación web', () => expect(notificationBackend()).toBe(webBackend));

  it('sin soporte, activar falla con push-unsupported y no pide nada más', async () => {
    const b = fakeBackend({ supported: () => false });
    setNotificationBackend(b);
    await expect(enableNotifications()).rejects.toMatchObject({ code: 'push-unsupported' });
    expect(b.calls).toEqual([]);
  });

  it('si no se concede el permiso, falla con permission-denied y no registra nada', async () => {
    const b = fakeBackend({ requestPermission: async () => false });
    setNotificationBackend(b);
    await expect(enableNotifications()).rejects.toBeInstanceOf(ServerError);
    expect(b.calls).toEqual([]);
    expect(useSettings.getState().settings.notificationsEnabled).toBe(false);
  });

  it('sin servidor: pide el permiso, registra el aviso diario y queda activado, sin tocar el push', async () => {
    const b = fakeBackend();
    setNotificationBackend(b);
    const r = await enableNotifications();
    expect(r).toEqual({ localDaily: true, push: false, pushError: null });
    expect(b.calls).toEqual(['permission', 'registerDaily']);
    expect(useSettings.getState().settings.notificationsEnabled).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('iPhone nativo con servidor: sin push explica que los avisos del servidor no están (no «este navegador»), y los demás siguen activos', async () => {
    vi.stubGlobal('Capacitor', { isNativePlatform: () => true, getPlatform: () => 'ios' });
    useSettings.setState({ settings: { ...useSettings.getState().settings, serverUrl: SERVER } });
    fetchMock.mockImplementation(async (url: string) =>
      url.endsWith('/api/health') ? new Response(JSON.stringify({ ok: true, version: '1', vapidPublicKey: 'clave' }), { status: 200 }) : new Response('{}', { status: 200 }),
    );
    setNotificationBackend(fakeBackend({ subscribePush: async () => null }));
    const r = await enableNotifications();
    expect(r.push).toBe(false);
    expect(r.pushError?.code).toBe('push-ios');
    expect(r.localDaily).toBe(true);
    vi.unstubAllGlobals();
    vi.stubGlobal('fetch', fetchMock);
  });

  it('con servidor: manda lo que devuelve la implementación (la suscripción) al servidor y guarda la cuenta', async () => {
    useSettings.setState({ settings: { ...useSettings.getState().settings, serverUrl: SERVER } });
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/api/health')) return new Response(JSON.stringify({ ok: true, version: '1', vapidPublicKey: 'clave' }), { status: 200 });
      if (url.endsWith('/api/devices') && init?.method === 'POST') return new Response(JSON.stringify({ deviceId: 'd1', token: 't1' }), { status: 201 });
      return new Response('{}', { status: 200 });
    });
    const b = fakeBackend();
    setNotificationBackend(b);
    const r = await enableNotifications();
    expect(r.push).toBe(true);
    const post = fetchMock.mock.calls.find((c) => String(c[0]).endsWith('/api/devices') && c[1]?.method === 'POST')!;
    expect(JSON.parse(post[1].body as string).subscription).toEqual({ endpoint: 'https://push.example/abc', keys: { p256dh: 'p', auth: 'a' } });
    expect((await readNotificationState()).push).toEqual({ serverUrl: SERVER, deviceId: 'd1', token: 't1' });
  });

  it('si la plataforma no tiene push (suscripción nula), el aviso diario queda y el error es push-unsupported', async () => {
    useSettings.setState({ settings: { ...useSettings.getState().settings, serverUrl: SERVER } });
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ ok: true, version: '1', vapidPublicKey: 'clave' }), { status: 200 }));
    setNotificationBackend(fakeBackend({ subscribePush: async () => null }));
    const r = await enableNotifications();
    expect(r.push).toBe(false);
    expect(r.localDaily).toBe(true);
    expect(r.pushError).toMatchObject({ code: 'push-unsupported' });
  });

  it('apagar desregistra el aviso diario y el push, y deja el borrado pendiente si el servidor no responde', async () => {
    await updateNotificationState({ push: { serverUrl: SERVER, deviceId: 'd1', token: 't1' } });
    fetchMock.mockRejectedValue(new Error('sin conexión'));
    const b = fakeBackend();
    setNotificationBackend(b);
    const pending = await disableNotifications();
    expect(pending).toBe(true);
    expect(b.calls).toEqual(['unregisterDaily', 'unsubscribe']);
    expect((await readNotificationState()).push).toBeNull();
    expect((await readNotificationState()).pendingDeletes).toHaveLength(1);
  });

  it('eliminar la cuenta con el servidor caído no olvida la cuenta (se puede reintentar)', async () => {
    await updateNotificationState({ push: { serverUrl: SERVER, deviceId: 'd1', token: 't1' } });
    fetchMock.mockRejectedValue(new Error('sin conexión'));
    const b = fakeBackend();
    setNotificationBackend(b);
    await expect(deleteServerAccount()).rejects.toMatchObject({ code: 'unreachable' });
    expect((await readNotificationState()).push).not.toBeNull();
    expect(b.calls).toEqual([]);
  });

  it('eliminar la cuenta confirmada desregistra todo', async () => {
    await updateNotificationState({ push: { serverUrl: SERVER, deviceId: 'd1', token: 't1' } });
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    const b = fakeBackend();
    setNotificationBackend(b);
    expect(await deleteServerAccount()).toBe(true);
    expect(b.calls).toEqual(['unsubscribe', 'unregisterDaily']);
  });

  it('la prueba sin servidor se muestra desde la propia app', async () => {
    const b = fakeBackend();
    setNotificationBackend(b);
    expect(await sendTestNotification()).toBe('local');
    expect(b.calls).toHaveLength(1);
    expect(b.calls[0]).toMatch(/^local:/);
  });
});
