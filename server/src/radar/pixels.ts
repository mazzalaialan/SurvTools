import { inflateSync } from 'node:zlib';

/** Imagen RGBA de 8 bits por canal, decodificada de un PNG (sin dependencias). */
export interface Rgba {
  width: number;
  height: number;
  /** width × height × 4 bytes. */
  data: Uint8Array;
}

/**
 * Decodifica un PNG de 8 bits sin entrelazado (color RGB, RGBA o paleta con transparencia), que es lo que publica SINARAME.
 * Devuelve `null` si es otro formato o está dañado: quien llama lo toma como «sin dato», nunca como «sin lluvia».
 */
export function decodePng(png: Buffer): Rgba | null {
  try {
    let off = 8;
    let width = 0;
    let height = 0;
    let color = -1;
    let palette: Buffer | null = null;
    let trns: Buffer | null = null;
    const idat: Buffer[] = [];
    while (off + 12 <= png.length) {
      const len = png.readUInt32BE(off);
      const type = png.toString('ascii', off + 4, off + 8);
      const body = png.subarray(off + 8, off + 8 + len);
      if (type === 'IHDR') {
        width = body.readUInt32BE(0);
        height = body.readUInt32BE(4);
        color = body[9]!;
        if (body[8] !== 8 || body[12] !== 0 || ![2, 3, 6].includes(color)) return null;
      } else if (type === 'PLTE') palette = Buffer.from(body);
      else if (type === 'tRNS') trns = Buffer.from(body);
      else if (type === 'IDAT') idat.push(body);
      else if (type === 'IEND') break;
      off += 12 + len;
    }
    if (!width || !height || width > 4096 || height > 4096 || color < 0) return null;
    const channels = color === 6 ? 4 : color === 2 ? 3 : 1;
    const stride = width * channels;
    const raw = inflateSync(Buffer.concat(idat));
    if (raw.length < height * (stride + 1)) return null;
    const out = new Uint8Array(width * height * 4);
    let prev = Buffer.alloc(stride);
    for (let y = 0; y < height; y++) {
      const filter = raw[y * (stride + 1)]!;
      const line = Buffer.from(raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)));
      for (let i = 0; i < stride; i++) {
        const a = i >= channels ? line[i - channels]! : 0;
        const b = prev[i]!;
        const c = i >= channels ? prev[i - channels]! : 0;
        let v = line[i]!;
        if (filter === 1) v += a;
        else if (filter === 2) v += b;
        else if (filter === 3) v += (a + b) >> 1;
        else if (filter === 4) {
          const p = a + b - c;
          const pa = Math.abs(p - a);
          const pb = Math.abs(p - b);
          const pc = Math.abs(p - c);
          v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
        } else if (filter !== 0) return null;
        line[i] = v & 0xff;
      }
      for (let x = 0; x < width; x++) {
        const o = (y * width + x) * 4;
        if (color === 6) {
          out[o] = line[x * 4]!;
          out[o + 1] = line[x * 4 + 1]!;
          out[o + 2] = line[x * 4 + 2]!;
          out[o + 3] = line[x * 4 + 3]!;
        } else if (color === 2) {
          out[o] = line[x * 3]!;
          out[o + 1] = line[x * 3 + 1]!;
          out[o + 2] = line[x * 3 + 2]!;
          out[o + 3] = 255;
        } else {
          const idx = line[x]!;
          if (!palette) return null;
          out[o] = palette[idx * 3] ?? 0;
          out[o + 1] = palette[idx * 3 + 1] ?? 0;
          out[o + 2] = palette[idx * 3 + 2] ?? 0;
          out[o + 3] = trns && idx < trns.length ? trns[idx]! : 255;
        }
      }
      prev = line;
    }
    return { width, height, data: out };
  } catch {
    return null;
  }
}
