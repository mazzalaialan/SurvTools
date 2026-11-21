import type { CSSProperties } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  Activity,
  Anchor,
  Axe,
  BatteryCharging,
  Bath,
  BriefcaseMedical,
  Car,
  Dog,
  Droplets,
  Filter,
  Fish,
  Flame,
  Gamepad2,
  Hammer,
  Package,
  Pill,
  Radio,
  Shield,
  Shirt,
  Sprout,
  Tent,
  Wheat,
  Wind,
  Wrench,
} from 'lucide-react';
import type { Category } from '@/core/model/types';

/** Íconos elegibles para categorías. El nombre se guarda en la entidad; agregar acá no requiere migración. */
export const CATEGORY_ICONS: Record<string, LucideIcon> = {
  droplets: Droplets,
  wheat: Wheat,
  filter: Filter,
  wind: Wind,
  'briefcase-medical': BriefcaseMedical,
  pill: Pill,
  'battery-charging': BatteryCharging,
  shield: Shield,
  flame: Flame,
  tent: Tent,
  shirt: Shirt,
  bath: Bath,
  wrench: Wrench,
  hammer: Hammer,
  axe: Axe,
  gamepad: Gamepad2,
  radio: Radio,
  car: Car,
  fish: Fish,
  dog: Dog,
  anchor: Anchor,
  package: Package,
  activity: Activity,
  sprout: Sprout,
};

export const CATEGORY_COLORS = [
  '#5f85ad',
  '#4f9aa8',
  '#6f9e4c',
  '#9aa84f',
  '#c9a04a',
  '#d0a03c',
  '#d8763a',
  '#c4573a',
  '#b84a30',
  '#a86a8f',
  '#7d6aa8',
  '#6aa89a',
  '#9a8a74',
  '#7a8696',
];

export function CategoryIcon({ category, size = 22 }: { category: Category | undefined; size?: number }) {
  const Icon = (category && CATEGORY_ICONS[category.icon]) || Package;
  return (
    <span className="cat-icon" style={category?.color ? ({ '--cat': category.color } as CSSProperties) : undefined} aria-hidden>
      <Icon size={size} />
    </span>
  );
}
