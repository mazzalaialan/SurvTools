import { MAX_LOCATION_DEPTH, type Id, type Location } from '@/core/model/types';

export interface LocationNode {
  location: Location;
  children: LocationNode[];
}

const byName = (a: Location, b: Location) => a.name.localeCompare(b.name);

export function buildTree(locations: Location[]): LocationNode[] {
  const nodes = new Map(locations.map((l) => [l.id, { location: l, children: [] as LocationNode[] }]));
  const roots: LocationNode[] = [];
  for (const node of [...nodes.values()].sort((a, b) => byName(a.location, b.location))) {
    const parent = node.location.parentId ? nodes.get(node.location.parentId) : undefined;
    // Un padre borrado deja al hijo huérfano: se muestra en la raíz en lugar de perderlo.
    (parent ? parent.children : roots).push(node);
  }
  return roots;
}

/** Cadena de ubicaciones desde la raíz hasta `id` (inclusive). */
export function pathOf(id: Id, byId: Map<Id, Location>): Location[] {
  const path: Location[] = [];
  let current = byId.get(id);
  while (current && path.length <= MAX_LOCATION_DEPTH) {
    path.unshift(current);
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return path;
}

export function pathLabel(id: Id, byId: Map<Id, Location>): string {
  return pathOf(id, byId)
    .map((l) => l.name)
    .join(' › ');
}

/** `id` y todos sus descendientes. */
export function subtreeIds(id: Id, locations: Location[]): Set<Id> {
  const result = new Set<Id>([id]);
  let added = true;
  while (added) {
    added = false;
    for (const l of locations) {
      if (l.parentId && result.has(l.parentId) && !result.has(l.id)) {
        result.add(l.id);
        added = true;
      }
    }
  }
  return result;
}

/** Niveles que ocupa el subárbol de `id` (1 = sin hijos). */
function subtreeHeight(id: Id, locations: Location[]): number {
  const children = locations.filter((l) => l.parentId === id);
  return 1 + Math.max(0, ...children.map((c) => subtreeHeight(c.id, locations)));
}

/**
 * ¿Se puede colgar `id` (con todo su subárbol) de `newParentId`?
 * No puede quedar dentro de sí mismo ni superar los 4 niveles.
 */
export function canMoveTo(id: Id, newParentId: Id | null, locations: Location[]): boolean {
  if (newParentId === null) return subtreeHeight(id, locations) <= MAX_LOCATION_DEPTH;
  if (subtreeIds(id, locations).has(newParentId)) return false;
  const parent = locations.find((l) => l.id === newParentId);
  if (!parent) return false;
  return parent.depth + subtreeHeight(id, locations) <= MAX_LOCATION_DEPTH;
}

/** Completa los campos que una versión anterior no guardaba. */
export function normalizeLocation(location: Location): Location {
  return { ...location, kitType: location.kitType ?? null };
}

export function depthFor(parentId: Id | null, byId: Map<Id, Location>): number {
  return parentId ? (byId.get(parentId)?.depth ?? 0) + 1 : 1;
}

/** El botiquín al que pertenece una ubicación: ella misma o la de más arriba que sea un botiquín (sus compartimentos cuentan como parte). */
export function kitOfLocation(id: Id, byId: Map<Id, Location>): Location | null {
  for (let l = byId.get(id), i = 0; l && i < 8; l = l.parentId ? byId.get(l.parentId) : undefined, i++) if (l.kitType !== null) return l;
  return null;
}
