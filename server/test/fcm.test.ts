import assert from 'node:assert/strict';
import { generateKeyPairSync, createVerify } from 'node:crypto';
import { describe, it } from 'node:test';
import { buildApp } from '../src/app.ts';
import { loadConfig } from '../src/config.ts';
import { openDb } from '../src/db.ts';
import { createFcmSender, fcmData, signServiceJwt, type FcmSender, type ServiceAccount } from '../src/fcm.ts';
import { createPushSender, type PushSender } from '../src/push.ts';

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048, privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } });
const account: ServiceAccount = { project_id: 'vikarg-prueba', client_email: 'fcm@vikarg-prueba.iam.gserviceaccount.com', private_key: privateKey };
const TOKEN = 't'.repeat(60);

/** Un `fetch` falso que anota los pedidos y responde según la dirección. */
function fakeFetch(handler: (url: string, init: RequestInit) => Response) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fn = (async (url: string, init: RequestInit) => {
    calls.push({ url: String(url), init });
    return handler(String(url), init);
  }) as unknown as typeof fetch;
  return { fn, calls };
}
const tokenOk = () => new Response(JSON.stringify({ access_token: 'acceso-1', expires_in: 3600 }), { status: 200 });

describe('FCM (API HTTP v1)', () => {
  it('el JWT de la cuenta de servicio está firmado con la clave y lleva lo que pide Google', () => {
    const jwt = signServiceJwt(account, 1_700_000_000);
    const [h, c, s] = jwt.split('.') as [string, string, string];
    assert.deepEqual(JSON.parse(Buffer.from(h, 'base64url').toString()), { alg: 'RS256', typ: 'JWT' });
    const claims = JSON.parse(Buffer.from(c, 'base64url').toString());
    assert.equal(claims.iss, account.client_email);
    assert.equal(claims.scope, 'https://www.googleapis.com/auth/firebase.messaging');
    assert.equal(claims.aud, 'https://oauth2.googleapis.com/token');
    assert.equal(claims.exp - claims.iat, 3600);
    assert.ok(createVerify('RSA-SHA256').update(`${h}.${c}`).verify(publicKey, Buffer.from(s, 'base64url')));
  });

  it('manda el mensaje a /v1/projects/<proyecto>/messages:send con el token de acceso, y lo reutiliza', async () => {
    const f = fakeFetch((url) => (url.includes('oauth2') ? tokenOk() : new Response('{}', { status: 200 })));
    const sender = createFcmSender(account, f.fn, () => 1_700_000_000_000);
    assert.equal(await sender.send({ fcm: TOKEN, platform: 'android' }, { type: 'test' }, 'high'), true);
    assert.equal(await sender.send({ fcm: TOKEN, platform: 'android' }, { type: 'test' }, 'normal'), true);
    assert.equal(f.calls.filter((c) => c.url.includes('oauth2')).length, 1, 'el token de acceso se pide una sola vez');
    const send = f.calls.filter((c) => c.url.includes('fcm.googleapis.com'));
    assert.equal(send[0]!.url, 'https://fcm.googleapis.com/v1/projects/vikarg-prueba/messages:send');
    assert.equal((send[0]!.init.headers as Record<string, string>).authorization, 'Bearer acceso-1');
    const body = JSON.parse(send[0]!.init.body as string).message;
    assert.equal(body.token, TOKEN);
    assert.deepEqual(JSON.parse(body.data.payload), { type: 'test' });
    assert.equal(body.android.priority, 'HIGH');
    assert.equal(JSON.parse(send[1]!.init.body as string).message.android.priority, 'NORMAL');
    assert.equal(body.apns, undefined);
  });

  it('el token de acceso vencido se vuelve a pedir', async () => {
    let t = 1_700_000_000_000;
    const f = fakeFetch((url) => (url.includes('oauth2') ? tokenOk() : new Response('{}', { status: 200 })));
    const sender = createFcmSender(account, f.fn, () => t);
    await sender.send({ fcm: TOKEN, platform: 'android' }, { type: 'test' }, 'normal');
    t += 3_600_000;
    await sender.send({ fcm: TOKEN, platform: 'android' }, { type: 'test' }, 'normal');
    assert.equal(f.calls.filter((c) => c.url.includes('oauth2')).length, 2);
  });

  it('iPhone: el mensaje de datos lleva la configuración de APNs para despertar la app', async () => {
    const f = fakeFetch((url) => (url.includes('oauth2') ? tokenOk() : new Response('{}', { status: 200 })));
    await createFcmSender(account, f.fn).send({ fcm: TOKEN, platform: 'ios' }, { type: 'test' }, 'high');
    const msg = JSON.parse(f.calls.find((c) => c.url.includes('messages:send'))!.init.body as string).message;
    assert.equal(msg.apns.payload.aps['content-available'], 1);
    assert.equal(msg.apns.headers['apns-priority'], '10');
  });

  it('un token que ya no existe (404 / UNREGISTERED) devuelve false para que se borre el dispositivo', async () => {
    const gone = JSON.stringify({ error: { code: 404, status: 'NOT_FOUND', details: [{ errorCode: 'UNREGISTERED' }] } });
    const f = fakeFetch((url) => (url.includes('oauth2') ? tokenOk() : new Response(gone, { status: 404 })));
    assert.equal(await createFcmSender(account, f.fn).send({ fcm: TOKEN, platform: 'android' }, { type: 'test' }, 'normal'), false);
  });

  it('un error nuestro (credenciales, cuota, mensaje inválido) se lanza y no borra el dispositivo', async () => {
    const f = fakeFetch((url) => (url.includes('oauth2') ? tokenOk() : new Response(JSON.stringify({ error: { status: 'INVALID_ARGUMENT' } }), { status: 400 })));
    await assert.rejects(createFcmSender(account, f.fn).send({ fcm: TOKEN, platform: 'android' }, { type: 'test' }, 'normal'), /FCM 400 INVALID_ARGUMENT/);
    const denied = fakeFetch(() => new Response('{}', { status: 401 }));
    await assert.rejects(createFcmSender(account, denied.fn).send({ fcm: TOKEN, platform: 'android' }, { type: 'test' }, 'normal'), /token de acceso/);
  });

  it('lo que viaja en el mensaje es el aviso completo (decisión pendiente: ver PENDIENTES)', () => {
    assert.deepEqual(Object.keys(fcmData({ type: 'test' })), ['payload']);
  });
});

describe('reparto por tipo de dispositivo', () => {
  const web = { endpoint: 'https://push.example/abc', keys: { p256dh: 'p', auth: 'a' } };
  it('un dispositivo nativo va por FCM, con la urgencia del aviso', async () => {
    const sent: unknown[] = [];
    const fcm: FcmSender = { projectId: 'p', send: async (t, p, u) => (sent.push([t, p.type, u]), true) };
    const sender = createPushSender(openDb(':memory:'), 'https://x', fcm);
    assert.equal(sender.fcmEnabled, true);
    assert.equal(await sender.send({ fcm: TOKEN, platform: 'android' }, { type: 'hazard' }), true);
    assert.deepEqual(sent, [[{ fcm: TOKEN, platform: 'android' }, 'hazard', 'high']]);
  });
  it('sin FCM configurado, un dispositivo nativo lanza error (no devuelve false, que borraría el dispositivo)', async () => {
    const sender = createPushSender(openDb(':memory:'), 'https://x', null);
    assert.equal(sender.fcmEnabled, false);
    await assert.rejects(sender.send({ fcm: TOKEN, platform: 'android' }, { type: 'test' }), /fcm-not-configured/);
  });
  it('un dispositivo web no pasa por FCM', async () => {
    let used = false;
    const fcm: FcmSender = { projectId: 'p', send: async () => ((used = true), true) };
    const sender = createPushSender(openDb(':memory:'), 'https://x', fcm);
    await assert.rejects(sender.send(web, { type: 'test' }));
    assert.equal(used, false);
  });
});

describe('registro de dispositivos nativos', () => {
  const prefs = { timezone: 'America/Argentina/Buenos_Aires', notifyHour: 9, language: 'es' };
  const post = (app: Awaited<ReturnType<typeof buildApp>>, subscription: unknown) => app.inject({ method: 'POST', url: '/api/devices', payload: { subscription, ...prefs } });
  const base: PushSender = { publicKey: 'k', async send() { return true; } };

  it('con FCM configurado: acepta un token y guarda solo los campos conocidos', async () => {
    const db = openDb(':memory:');
    const app = await buildApp(loadConfig({ DATA_DIR: ':memory:' }), db, { ...base, fcmEnabled: true }, false);
    const res = await post(app, { fcm: TOKEN, platform: 'android', extra: 'no se guarda' });
    assert.equal(res.statusCode, 201);
    const row = db.prepare('SELECT subscription FROM devices').get() as { subscription: string };
    assert.deepEqual(JSON.parse(row.subscription), { fcm: TOKEN, platform: 'android' });
    assert.equal(JSON.parse((await app.inject('/api/health')).body).fcm, true);
  });
  it('sin FCM configurado: lo rechaza con fcm-not-configured', async () => {
    const app = await buildApp(loadConfig({ DATA_DIR: ':memory:' }), openDb(':memory:'), base, false);
    const res = await post(app, { fcm: TOKEN, platform: 'android' });
    assert.equal(res.statusCode, 400);
    assert.deepEqual(JSON.parse(res.body), { error: 'fcm-not-configured' });
    assert.equal(JSON.parse((await app.inject('/api/health')).body).fcm, false);
  });
  it('los dispositivos web siguen registrándose igual, y lo que no es ni web ni nativo se rechaza', async () => {
    const app = await buildApp(loadConfig({ DATA_DIR: ':memory:' }), openDb(':memory:'), base, false);
    assert.equal((await post(app, { endpoint: 'https://push.example/abc', keys: { p256dh: 'p', auth: 'a' } })).statusCode, 201);
    assert.equal((await post(app, { fcm: 'corto', platform: 'android' })).statusCode, 400);
    assert.equal((await post(app, { fcm: TOKEN, platform: 'windows' })).statusCode, 400);
    assert.equal((await post(app, {})).statusCode, 400);
  });
});
