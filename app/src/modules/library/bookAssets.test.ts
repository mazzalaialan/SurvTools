import { describe, expect, it } from 'vitest';
import { isRelativeAsset, resolveAssetPath } from './bookAssets';

describe('archivos de los libros', () => {
  it('rutas relativas a la carpeta del capítulo', () => {
    expect(resolveAssetPath('cap-1.html', 'img/a.webp')).toBe('img/a.webp');
    expect(resolveAssetPath('cap-1.html', './img/a.webp')).toBe('img/a.webp');
    expect(resolveAssetPath('parte-2/cap-1.html', 'img/a.webp')).toBe('parte-2/img/a.webp');
    expect(resolveAssetPath('parte-2/cap-1.html', '../img/a.webp')).toBe('img/a.webp');
    expect(resolveAssetPath('cap-1.html', 'img/a.webp?v=2#x')).toBe('img/a.webp');
  });
  it('no se sale de la carpeta del libro con «..» de más', () => {
    expect(resolveAssetPath('cap-1.html', '../../a.webp')).toBe('a.webp');
  });
  it('distingue lo relativo de direcciones completas, datos incrustados y anclas', () => {
    expect(isRelativeAsset('img/a.webp')).toBe(true);
    expect(isRelativeAsset('./a.webp')).toBe(true);
    expect(isRelativeAsset('https://x.org/a.png')).toBe(false);
    expect(isRelativeAsset('data:image/png;base64,AAAA')).toBe(false);
    expect(isRelativeAsset('blob:https://app/1')).toBe(false);
    expect(isRelativeAsset('//cdn.x.org/a.png')).toBe(false);
    expect(isRelativeAsset('#nota-1')).toBe(false);
  });
});
