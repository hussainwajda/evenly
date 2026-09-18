import {
  Baby,
  BookOpen,
  Briefcase,
  Bus,
  Car,
  CircleEllipsis,
  Coffee,
  Dumbbell,
  Film,
  Fuel,
  Gamepad2,
  Gift,
  GraduationCap,
  HandCoins,
  HeartPulse,
  House,
  Landmark,
  type LucideIcon,
  Music,
  PawPrint,
  Pill,
  Plane,
  Receipt,
  Shirt,
  ShoppingBag,
  ShoppingBasket,
  Smartphone,
  Sparkles,
  TrainFront,
  Utensils,
  Wifi,
  Wrench,
  Zap,
} from 'lucide-react'
import { cn } from '@/lib/utils'

export const CATEGORY_ICONS: Record<string, LucideIcon> = {
  utensils: Utensils,
  coffee: Coffee,
  'shopping-basket': ShoppingBasket,
  car: Car,
  fuel: Fuel,
  bus: Bus,
  train: TrainFront,
  house: House,
  zap: Zap,
  wifi: Wifi,
  receipt: Receipt,
  smartphone: Smartphone,
  'shopping-bag': ShoppingBag,
  shirt: Shirt,
  'heart-pulse': HeartPulse,
  pill: Pill,
  dumbbell: Dumbbell,
  sparkles: Sparkles,
  plane: Plane,
  'gamepad-2': Gamepad2,
  film: Film,
  music: Music,
  'graduation-cap': GraduationCap,
  'book-open': BookOpen,
  briefcase: Briefcase,
  gift: Gift,
  'hand-coins': HandCoins,
  landmark: Landmark,
  wrench: Wrench,
  baby: Baby,
  'paw-print': PawPrint,
  'circle-ellipsis': CircleEllipsis,
}

export const CATEGORY_COLORS = [
  '#F97316', '#22C55E', '#3B82F6', '#8B5CF6', '#EAB308', '#EC4899', '#EF4444',
  '#14B8A6', '#6366F1', '#D946EF', '#84CC16', '#06B6D4', '#F59E0B', '#94A3B8',
]

const SIZES = {
  sm: 'size-8 [&_svg]:size-4',
  md: 'size-10 [&_svg]:size-5',
  lg: 'size-12 [&_svg]:size-6',
}

export function CategoryIcon({
  icon,
  color,
  size = 'md',
  className,
  label,
}: {
  icon: string | undefined
  color: string | undefined
  size?: keyof typeof SIZES
  className?: string
  /** Provide when the icon stands alone without visible text. */
  label?: string
}) {
  const Icon = (icon && CATEGORY_ICONS[icon]) || CircleEllipsis
  const c = color ?? '#94A3B8'
  return (
    <span
      className={cn('grid shrink-0 place-items-center rounded-full', SIZES[size], className)}
      style={{ backgroundColor: `color-mix(in oklab, ${c} 18%, transparent)`, color: c }}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <Icon strokeWidth={2} />
    </span>
  )
}
