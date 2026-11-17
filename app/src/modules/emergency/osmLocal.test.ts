import { afterEach, describe, expect, it, vi } from 'vitest';
import { describeLocation, fetchLocalAround, fetchOsmNearby } from './osm';

// Lo que responde /api/osm/around de la base propia (server/src/osm/around.ts), con calles reales de Montevideo.
const local = {
  builtAt: '2026-11-17T00:00:00.000Z',
  elements: [
    { type: 'node', id: 1, lat: -34.9059, lon: -56.1914, tags: { highway: 'residential', name: 'Paraguay' } },
    { type: 'node', id: 2, lat: -34.9057, lon: -56.1912, tags: { highway: 'residential', name: 'Cuareim' } },
    { type: 'node', id: 3, lat: -34.90581, lon: -56.19131, tags: { 'addr:street': 'Mitre', 'addr:housenumber': '248' } },
  ],
};
const nominatim = { address: { road: 'Mitre', city: 'Montevideo' } };

function stub(handler: (url: string) => Response | Promise<Response>) {
  const calls: string[] = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string | URL) => {
    calls.push(String(url));
    return handler(String(url));
  }));
  return calls;
}

describe('Mi ubicación: base propia del servidor primero, servicios públicos de respaldo', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('sin servidor configurado no consulta nada', async () => {
    const calls = stub(() => new Response('{}'));
    expect(await fetchLocalAround('', -34.9, -56.19)).toBeNull();
    expect(calls).toHaveLength(0);
  });

  it('con la base del servidor no toca Overpass y completa la altura y las entrecalles', async () => {
    const calls = stub((url) =>
      url.includes('/api/osm/around') ? new Response(JSON.stringify(local)) : url.includes('nominatim') ? new Response(JSON.stringify(nominatim)) : new Response('{"elements":[]}'),
    );
    const partials: string[] = [];
    const info = await describeLocation(-34.9058, -56.1913, 'es', (p) => partials.push(p.address), 'https://mi.servidor/');
    expect(calls.some((u) => u.startsWith('https://mi.servidor/api/osm/around?'))).toBe(true);
    expect(calls.some((u) => u.includes('overpass') || u.includes('maps.mail.ru'))).toBe(false);
    expect(info.address).toBe('Mitre 248 (aprox.)');
    expect(info.nearbyStreets).toEqual(['Paraguay', 'Cuareim']);
    // Lo que va llegando se entrega a la pantalla; lo último ya tiene la altura.
    expect(partials.at(-1)).toBe('Mitre 248 (aprox.)');
  });

  it('si el servidor no responde (503, sin base) usa los servicios públicos', async () => {
    const overpassBody = { elements: [{ type: 'way', id: 9, center: { lat: -34.9059, lon: -56.1914 }, tags: { highway: 'residential', name: 'Paraguay' } }] };
    const calls = stub((url) => {
      if (url.includes('/api/osm/around')) return new Response('{"error":"sin base de calles"}', { status: 503 });
      if (url.includes('nominatim')) return new Response(JSON.stringify(nominatim));
      return new Response(JSON.stringify(overpassBody));
    });
    const info = await describeLocation(-34.9058, -56.1913, 'es', undefined, 'https://mi.servidor');
    expect(calls.some((u) => u.includes('/api/osm/around'))).toBe(true);
    expect(calls.some((u) => u.includes('overpass') || u.includes('maps.mail.ru'))).toBe(true);
    expect(info.nearbyStreets).toEqual(['Paraguay']);
  });

  it('si el servidor no se puede alcanzar también cae a los servicios públicos', async () => {
    const calls = stub((url) => {
      if (url.includes('mi.servidor')) throw new TypeError('sin red');
      if (url.includes('nominatim')) return new Response(JSON.stringify(nominatim));
      return new Response('{"elements":[]}');
    });
    const info = await describeLocation(-34.9058, -56.1913, 'es', undefined, 'https://mi.servidor');
    expect(info.address).toBe('Mitre');
    expect(calls.some((u) => u.includes('overpass'))).toBe(true);
  });

  it('Buscar cercanos: primero la base del servidor y, si no responde, Overpass', async () => {
    const police = { type: 'node', id: 7, lat: -34.906, lon: -56.19, tags: { amenity: 'police', name: 'Comisaría 3.ª' } };
    let calls = stub((url) => (url.includes('/api/osm/nearby') ? new Response(JSON.stringify({ elements: [police] })) : new Response('{"elements":[]}')));
    const ok = await fetchOsmNearby(-34.9058, -56.1913, 25_000, 'fuel', 'https://mi.servidor');
    expect(ok.map((p) => p.name)).toEqual(['Comisaría 3.ª']);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain('service=fuel');
    expect(calls[0]).toContain('radius=25000');
    calls = stub((url) => (url.includes('/api/osm/nearby') ? new Response('{}', { status: 503 }) : new Response(JSON.stringify({ elements: [police] }))));
    const fallback = await fetchOsmNearby(-34.9058, -56.1913, 25_000, null, 'https://mi.servidor');
    expect(fallback.map((p) => p.name)).toEqual(['Comisaría 3.ª']);
    expect(calls.some((u) => u.includes('overpass') || u.includes('maps.mail.ru'))).toBe(true);
  });

  it('en Argentina, sin número exacto, pide la altura de Georef al servidor y la suma a la dirección', async () => {
    const calls = stub((url) => {
      if (url.includes('/api/address/ar')) return new Response(JSON.stringify({ found: true, address: { number: 1745, street: 'PUEYRREDON' } }));
      if (url.includes('/api/osm/around')) return new Response(JSON.stringify({ elements: [] }));
      if (url.includes('nominatim')) return new Response(JSON.stringify({ address: { road: 'Pueyrredon', town: 'Hurlingham', state: 'Buenos Aires', country_code: 'ar' } }));
      return new Response('{"elements":[]}');
    });
    const partials: string[] = [];
    const info = await describeLocation(-34.5775, -58.6316, 'es', (p) => partials.push(p.address), 'https://mi.servidor');
    expect(info.address).toBe('Pueyrredon 1745 (aprox.)');
    expect(calls.some((u) => u.includes('/api/address/ar?') && u.includes('street=Pueyrredon'))).toBe(true);
    expect(partials.at(-1)).toBe('Pueyrredon 1745 (aprox.)');
  });

  it('fuera de Argentina no consulta a Georef', async () => {
    const calls = stub((url) => (url.includes('nominatim') ? new Response(JSON.stringify({ address: { road: 'Mitre', country_code: 'uy' } })) : new Response('{"elements":[]}')));
    await describeLocation(-34.9, -56.19, 'es', undefined, 'https://mi.servidor');
    expect(calls.some((u) => u.includes('/api/address/ar'))).toBe(false);
  });
});
