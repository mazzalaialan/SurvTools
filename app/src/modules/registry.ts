import type { LucideIcon } from 'lucide-react';
import {
  Activity,
  Anchor,
  BellRing,
  BookA,
  BookHeart,
  BookOpen,
  BriefcaseMedical,
  Calculator,
  CalendarDays,
  CloudSun,
  Compass,
  FileText,
  Flag,
  Footprints,
  HeartPulse,
  Lasso,
  Magnet,
  LocateFixed,
  Map as MapIcon,
  MapPin,
  Moon,
  Mountain,
  Package,
  Phone,
  Radio,
  Search,
  Sparkles,
  Spool,
  Link2,
  Sprout,
  Tags,
  Triangle,
  Warehouse, Fish, ListChecks, Scale, Shirt, Timer, Metronome, Waves, History, GitCompareArrows } from 'lucide-react';
import type { Capability, CapabilityMap } from '@/core/capabilities/capabilities';

/** En el orden en que se muestran en Inicio. */
export const SECTIONS = ['firstAid', 'orientation', 'weather', 'training', 'documents', 'inventory', 'knots', 'garden', 'fishing', 'library'] as const;
export type Section = (typeof SECTIONS)[number];

export interface ModuleDef {
  id: string;
  section: Section;
  icon: LucideIcon;
  /** Ruta de la pantalla del módulo. */
  path?: string;
  /** `true` cuando el módulo ya tiene pantalla. */
  implemented: boolean;
  /** Se oculta cuando este interruptor de Ajustes está apagado (por ejemplo, el equipo de Entrenamiento en copias que no usan el Inventario). */
  hideWhenOff?: 'trainingGear';
  /** Sin estas capacidades el módulo no puede funcionar: se muestra deshabilitado. */
  requires?: Capability[];
  /** Sin estas capacidades funciona con carga manual. */
  degradesWithout?: Capability[];
}

export const MODULES: ModuleDef[] = [
  { id: 'inventory', section: 'inventory', icon: Package, implemented: true, path: '/inventory/items' },
  { id: 'locations', section: 'inventory', icon: Warehouse, implemented: true, path: '/inventory/locations' },
  { id: 'alerts', section: 'inventory', icon: BellRing, implemented: true, path: '/inventory/alerts' },
  { id: 'categories', section: 'inventory', icon: Tags, implemented: true, path: '/inventory/categories' },
  { id: 'recommendations', section: 'inventory', icon: Calculator, implemented: true, path: '/inventory/recommendations' },
  { id: 'contacts', section: 'firstAid', icon: Phone, implemented: true, path: '/first-aid/contacts' },
  { id: 'myLocation', section: 'firstAid', icon: LocateFixed, implemented: true, path: '/first-aid/location', degradesWithout: ['geolocation'] },
  { id: 'medical', section: 'firstAid', icon: HeartPulse, implemented: true, path: '/first-aid/medical' },
  { id: 'firstAidGuides', section: 'firstAid', icon: BookHeart, implemented: true, path: '/first-aid/guides' },
  { id: 'kits', section: 'firstAid', icon: BriefcaseMedical, implemented: true, path: '/first-aid/kits' },
  { id: 'radio', section: 'firstAid', icon: Radio, implemented: true, path: '/first-aid/radio' },
  { id: 'documents', section: 'documents', icon: FileText, implemented: true, path: '/documents' },
  { id: 'compass', section: 'orientation', icon: Compass, implemented: true, path: '/orientation/compass', requires: ['orientation'] },
  { id: 'declination', section: 'orientation', icon: Magnet, implemented: true, path: '/orientation/declination' },
  { id: 'inclinometer', section: 'orientation', icon: Triangle, implemented: true, path: '/orientation/inclinometer', requires: ['motion'] },
  { id: 'altimeter', section: 'orientation', icon: Mountain, implemented: true, path: '/orientation/altimeter', requires: ['geolocation'] },
    { id: 'maps', section: 'orientation', icon: MapIcon, implemented: true, path: '/orientation/maps', degradesWithout: ['geolocation'] },
  // Las rutas van dentro de Waypoints (abajo), no como módulo aparte.
  { id: 'waypoints', section: 'orientation', icon: MapPin, implemented: true, path: '/orientation/waypoints', degradesWithout: ['geolocation'] },
  { id: 'tracks', section: 'orientation', icon: Footprints, implemented: true, path: '/orientation/tracks' },
  { id: 'starmap', section: 'orientation', icon: Sparkles, implemented: true, path: '/orientation/starmap', degradesWithout: ['orientation'] },
  { id: 'workouts', section: 'training', icon: Activity, implemented: true, path: '/training/workouts', degradesWithout: ['geolocation'] },
  { id: 'outings', section: 'training', icon: Flag, implemented: true, path: '/training/outings' },
  { id: 'stopwatch', section: 'training', icon: Timer, implemented: true, path: '/training/stopwatch' },
  { id: 'metronome', section: 'training', icon: Metronome, implemented: true, path: '/training/metronome' },
  { id: 'tools', section: 'training', icon: Calculator, implemented: true, path: '/training/tools' },
  { id: 'weight', section: 'training', icon: Scale, implemented: true, path: '/training/weight' },
  { id: 'gear', section: 'training', icon: Shirt, implemented: true, path: '/training/gear', hideWhenOff: 'trainingGear' },
  { id: 'weather', section: 'weather', icon: CloudSun, implemented: true, path: '/weather/forecast' },
  { id: 'weatherCompare', section: 'weather', icon: GitCompareArrows, implemented: true, path: '/weather/compare', degradesWithout: ['geolocation'] },
  { id: 'weatherHistory', section: 'weather', icon: History, implemented: true, path: '/weather/history', degradesWithout: ['geolocation'] },
  { id: 'weatherMap', section: 'weather', icon: MapIcon, implemented: true, path: '/weather/map' },
  { id: 'navigation', section: 'weather', icon: Waves, implemented: true, path: '/weather/navigation', degradesWithout: ['geolocation'] },
  { id: 'astronomy', section: 'weather', icon: Moon, implemented: true, path: '/weather/sky', degradesWithout: ['geolocation'] },
  { id: 'knotGuide', section: 'knots', icon: Lasso, implemented: true, path: '/knots/guide' },
  { id: 'anchors', section: 'knots', icon: Anchor, implemented: true, path: '/knots/anchors' },
  { id: 'ropes', section: 'knots', icon: Spool, implemented: true, path: '/knots/ropes' },
  { id: 'carabiners', section: 'knots', icon: Link2, implemented: true, path: '/knots/carabiners' },
  { id: 'knotGlossary', section: 'knots', icon: BookA, implemented: true, path: '/knots/glossary' },
  { id: 'fishingMap', section: 'fishing', icon: MapIcon, implemented: true, path: '/fishing/map' },
  { id: 'fishingSpecies', section: 'fishing', icon: Fish, implemented: true, path: '/fishing/species' },
  { id: 'fishingWaters', section: 'fishing', icon: Waves, implemented: true, path: '/fishing/waters', degradesWithout: ['geolocation'] },
  { id: 'fishingRules', section: 'fishing', icon: ListChecks, implemented: true, path: '/fishing/rules' },
  { id: 'gardenCalendar', section: 'garden', icon: CalendarDays, implemented: true, path: '/garden/calendar' },
  { id: 'gardenBeds', section: 'garden', icon: Sprout, implemented: true, path: '/garden/beds' },
  { id: 'libraryBooks', section: 'library', icon: BookOpen, implemented: true, path: '/library/books' },
  { id: 'librarySearch', section: 'library', icon: Search, implemented: true, path: '/library/search' },
];

export type ModuleStatus =
  | { kind: 'available' }
  | { kind: 'degraded'; missing: Capability[] }
  | { kind: 'unavailable'; missing: Capability[] }
  | { kind: 'soon' };

/** La falta de una capacidad requerida tiene prioridad: el usuario debe saber que en este dispositivo nunca va a andar. */
export function moduleStatus(mod: ModuleDef, caps: CapabilityMap): ModuleStatus {
  const missingRequired = (mod.requires ?? []).filter((c) => !caps[c]);
  if (missingRequired.length) return { kind: 'unavailable', missing: missingRequired };
  if (!mod.implemented) return { kind: 'soon' };
  const missingOptional = (mod.degradesWithout ?? []).filter((c) => !caps[c]);
  if (missingOptional.length) return { kind: 'degraded', missing: missingOptional };
  return { kind: 'available' };
}
