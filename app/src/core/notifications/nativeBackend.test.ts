import { beforeEach, describe, expect, it, vi } from 'vitest';

const listeners = new Map<string, (e: unknown) => void>();
const push = {
  addListener: vi.fn(async (name: string, fn: (e: unknown) => void) => {
    listeners.set(name, fn);
    return { remove: vi.fn(async () => undefined) };
  }),
  register: vi.fn(async () => undefined),
  unregister: vi.fn(async () => undefined),
};
const local = {
  checkPermissions: vi.fn(async () => ({ display: 'prompt' })),
  requestPermissions: vi.fn(async () => ({ display: 'granted' })),
  schedule: vi.fn(async () => ({ notifications: [] })),
  getDeliveredNotifications: vi.fn(async () => ({ notifications: [] as unknown[] })),
  removeDeliveredNotifications: vi.fn(async () => undefined),
  addListener: vi.fn(async () => ({ remove: async () => undefined })),
};
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => true, getPlatform: () => 'android' } }));
vi.mock('@capacitor/push-notifications', () => ({ PushNotifications: push }));
vi.mock('@capacitor/local-notifications', () => ({ LocalNotifications: local }));

const { nativeBackend, idForTag, routeForPush, refreshNativePermission, startNativeNotifications } = await import('./nativeBackend');

beforeEach(() => {
  listeners.clear();
  vi.clearAllMocks();
});

describe('notificaciones en la app nativa', () => {
  it('el número de un aviso sale de su etiqueta: es estable, positivo y distinto entre etiquetas', () => {
    expect(idForTag('altimeter')).toBe(idForTag('altimeter'));
    expect(idForTag('altimeter')).toBeGreaterThan(0);
    expect(idForTag('altimeter')).not.toBe(idForTag('rain-casa'));
    expect(idForTag('')).toBeGreaterThan(0);
  });

  it('soporte y permiso: se guarda el último valor conocido (el del plugin es asíncrono)', async () => {
    expect(nativeBackend.supported()).toBe(true);
    expect(nativeBackend.permission()).toBe('default');
    expect(await nativeBackend.requestPermission()).toBe(true);
    expect(nativeBackend.permission()).toBe('granted');
    local.checkPermissions.mockResolvedValueOnce({ display: 'denied' });
    expect(await refreshNativePermission()).toBe('denied');
    expect(nativeBackend.permission()).toBe('denied');
  });

  it('push: sin Firebase en el servidor no registra nada', async () => {
    expect(await nativeBackend.subscribePush({ vapidPublicKey: 'k', fcm: false })).toBeNull();
    expect(push.register).not.toHaveBeenCalled();
  });

  it('push: devuelve el token de FCM con la plataforma cuando el sistema lo entrega', async () => {
    push.register.mockImplementationOnce(async () => {
      listeners.get('registration')!({ value: 'token-de-fcm' });
    });
    expect(await nativeBackend.subscribePush({ vapidPublicKey: 'k', fcm: true })).toEqual({ fcm: 'token-de-fcm', platform: 'android' });
  });

  it('push: si el registro falla devuelve null (la app muestra que no hay push y sigue con el aviso local)', async () => {
    push.register.mockImplementationOnce(async () => {
      listeners.get('registrationError')!({ error: 'sin Google Play' });
    });
    expect(await nativeBackend.subscribePush({ vapidPublicKey: 'k', fcm: true })).toBeNull();
    push.register.mockRejectedValueOnce(new Error('x'));
    expect(await nativeBackend.subscribePush({ vapidPublicKey: 'k', fcm: true })).toBeNull();
  });

  it('aviso local: se programa con el número de su etiqueta y la pantalla que abre', async () => {
    await nativeBackend.showLocal({ title: 'Lluvia', body: 'Cuerpo', tag: 'rain-casa', url: '#/weather/forecast', data: { state: 'soon' } });
    expect(local.schedule).toHaveBeenCalledWith({
      notifications: [{ id: idForTag('rain-casa'), title: 'Lluvia', body: 'Cuerpo', extra: { url: '#/weather/forecast', tag: 'rain-casa', state: 'soon' } }],
    });
  });

  it('un aviso ya mostrado se busca por etiqueta y se puede cerrar', async () => {
    expect(await nativeBackend.shownByTag('rain-casa')).toBeNull();
    const delivered = { id: idForTag('rain-casa'), title: 't', body: 'b', extra: { state: 'soon' } };
    local.getDeliveredNotifications.mockResolvedValueOnce({ notifications: [delivered] });
    const shown = (await nativeBackend.shownByTag('rain-casa'))!;
    expect(shown.data).toEqual({ state: 'soon' });
    shown.close();
    expect(local.removeDeliveredNotifications).toHaveBeenCalledWith({ notifications: [delivered] });
  });

  it('al tocar un aviso de FCM se abre la pantalla según el tipo; lo desconocido va a la lista de avisos', () => {
    expect(routeForPush({ type: 'rain' })).toBe('#/weather/forecast');
    expect(routeForPush({ type: 'alerts' })).toBe('#/inventory/alerts');
    expect(routeForPush({ type: 'algo-nuevo' })).toBe('#/inventory/alerts');
    expect(routeForPush(undefined)).toBe('#/inventory/alerts');
  });

  it('desregistrar el push no falla aunque el plugin falle', async () => {
    push.unregister.mockRejectedValueOnce(new Error('x'));
    await expect(nativeBackend.unsubscribePush()).resolves.toBeUndefined();
  });

  it('con la app abierta, un aviso de FCM lo muestra la app (Android no lo muestra solo), con el texto genérico y la pantalla que corresponde', async () => {
    await startNativeNotifications();
    local.schedule.mockClear();
    listeners.get('pushNotificationReceived')!({ data: { type: 'rain' } });
    await Promise.resolve();
    expect(local.schedule).toHaveBeenCalledTimes(1);
    const n = (local.schedule.mock.calls[0] as unknown as [{ notifications: { id: number; title: string; body: string; extra: { url: string } }[] }])[0].notifications[0]!;
    expect(n.title).toBe('VikArg');
    expect(n.body).toBe('Tenés avisos nuevos');
    expect(n.extra.url).toBe('#/weather/forecast');
    expect(n.id).toBe(idForTag('vikarg-alerts'));
    local.schedule.mockClear();
    listeners.get('pushNotificationReceived')!({ data: { type: 'test' } });
    await Promise.resolve();
    expect((local.schedule.mock.calls[0] as unknown as [{ notifications: { body: string }[] }])[0].notifications[0]!.body).toBe('Las notificaciones funcionan correctamente.');
  });
});
