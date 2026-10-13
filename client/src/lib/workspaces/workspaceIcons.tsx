import {
  Building2,
  Briefcase,
  Rocket,
  Target,
  BarChart3,
  Lightbulb,
  Star,
  Flame,
  Folder,
  Palette,
  Wrench,
  BookOpen,
  GraduationCap,
  Globe,
  Cloud,
  Gem,
  Smartphone,
  Home,
  Clapperboard,
  Music,
  ShoppingBag,
  FlaskConical,
  TrendingUp,
  Sparkles,
  type LucideIcon,
} from 'lucide-react';

/**
 * Curated set of workspace icons. Keys are 3–8 chars so they fit in the
 * existing `workspaces.icon` varchar(8) column — no migration needed.
 * Picker renders the React component; legacy rows that still hold an
 * emoji or single character fall through to a text span.
 */

export const WORKSPACE_ICON_KEYS = [
  'building',
  'case',
  'rocket',
  'target',
  'chart',
  'idea',
  'star',
  'flame',
  'folder',
  'palette',
  'wrench',
  'books',
  'school',
  'globe',
  'cloud',
  'gem',
  'phone',
  'home',
  'film',
  'music',
  'shop',
  'lab',
  'trend',
  'sparkle',
] as const;

export type WorkspaceIconKey = (typeof WORKSPACE_ICON_KEYS)[number];

const ICON_MAP: Record<WorkspaceIconKey, LucideIcon> = {
  building: Building2,
  case: Briefcase,
  rocket: Rocket,
  target: Target,
  chart: BarChart3,
  idea: Lightbulb,
  star: Star,
  flame: Flame,
  folder: Folder,
  palette: Palette,
  wrench: Wrench,
  books: BookOpen,
  school: GraduationCap,
  globe: Globe,
  cloud: Cloud,
  gem: Gem,
  phone: Smartphone,
  home: Home,
  film: Clapperboard,
  music: Music,
  shop: ShoppingBag,
  lab: FlaskConical,
  trend: TrendingUp,
  sparkle: Sparkles,
};

export const DEFAULT_WORKSPACE_ICON: WorkspaceIconKey = 'building';

export function isWorkspaceIconKey(key: string): key is WorkspaceIconKey {
  return key in ICON_MAP;
}

interface WorkspaceIconProps {
  icon: string | undefined | null;
  className?: string;
}

/**
 * Renders the lucide icon for a known key, falls back to the raw string
 * (emoji / single character) for legacy rows that haven't been migrated
 * to a key yet.
 */
export function WorkspaceIcon({ icon, className }: WorkspaceIconProps) {
  if (icon && isWorkspaceIconKey(icon)) {
    const Icon = ICON_MAP[icon];
    return <Icon className={className ?? 'w-4 h-4'} />;
  }
  return <span className={className}>{icon ?? ''}</span>;
}

export function getWorkspaceIcon(icon: string | undefined | null): LucideIcon | null {
  if (icon && isWorkspaceIconKey(icon)) return ICON_MAP[icon];
  return null;
}
