import { afterEach, describe, expect, it } from 'vitest';
import { handleBack, hasBackHandlers, pushBack } from './backStack';

afterEach(() => {
  while (handleBack());
});

describe('pila del botón atrás', () => {
  it('sin nada abierto no hay nada que cerrar', () => {
    expect(hasBackHandlers()).toBe(false);
    expect(handleBack()).toBe(false);
  });
  it('cierra de a uno, lo último abierto primero', () => {
    const closed: string[] = [];
    pushBack(() => closed.push('diálogo'));
    pushBack(() => closed.push('confirmación'));
    expect(handleBack()).toBe(true);
    expect(closed).toEqual(['confirmación']);
    expect(handleBack()).toBe(true);
    expect(closed).toEqual(['confirmación', 'diálogo']);
    expect(handleBack()).toBe(false);
  });
  it('lo que se cierra por otro lado sale de la pila y no se vuelve a cerrar', () => {
    const closed: string[] = [];
    const off = pushBack(() => closed.push('a'));
    pushBack(() => closed.push('b'));
    off();
    expect(handleBack()).toBe(true);
    expect(closed).toEqual(['b']);
    expect(handleBack()).toBe(false);
  });
  it('quitar dos veces el mismo no saca otro', () => {
    const closed: string[] = [];
    const off = pushBack(() => closed.push('a'));
    pushBack(() => closed.push('b'));
    off();
    off();
    handleBack();
    expect(closed).toEqual(['b']);
  });
});
