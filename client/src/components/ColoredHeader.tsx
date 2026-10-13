import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Section-card header used across the app: a tinted gradient strip + a
 * vibrant icon medallion + the title and (optional) subtitle. Always
 * lives at the top of a `bg-card shadow-sm rounded-2xl` section; the body
 * below stays white so table/chart content is readable.
 *
 * Pick the gradients from the same palette the KPI hero tiles use so the
 * whole app reads as one system:
 *   - emerald / teal      → revenue, growth, money in
 *   - amber / orange      → warnings, outstanding, attention
 *   - indigo / violet     → active work, primary surface
 *   - sky / blue          → time, hours, schedule
 *   - rose / red          → overdue, destructive
 *   - cyan                → secondary metrics
 */
export interface ColoredHeaderProps {
  icon: LucideIcon;
  title: string;
  subtitle?: string;
  /** Background gradient classes for the strip, e.g. "from-emerald-50 via-card to-card". */
  gradient: string;
  /** Background gradient classes for the icon medallion, e.g. "from-emerald-500 to-teal-600". */
  iconGradient: string;
  /** Optional right-side slot — usually a small badge, link, or action. */
  trailing?: React.ReactNode;
}

export function ColoredHeader({
  icon: Icon,
  title,
  subtitle,
  gradient,
  iconGradient,
  trailing,
}: ColoredHeaderProps) {
  return (
    <header
      className={cn(
        'relative flex items-center gap-3 px-5 py-4 border-b border-border/40 bg-gradient-to-r dark:opacity-90',
        gradient
      )}
    >
      <span
        className={cn(
          'w-9 h-9 rounded-xl flex items-center justify-center text-white shadow-sm shrink-0 bg-gradient-to-br',
          iconGradient
        )}
      >
        <Icon className="w-4 h-4" strokeWidth={2.25} />
      </span>
      <div className="min-w-0 flex-1">
        <h2 className="text-sm font-semibold text-foreground truncate">{title}</h2>
        {subtitle && (
          <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{subtitle}</p>
        )}
      </div>
      {trailing && <div className="shrink-0">{trailing}</div>}
    </header>
  );
}
