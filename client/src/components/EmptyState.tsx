import { ReactNode } from 'react';
import { LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  /** Optional primary action (gradient button). */
  actionLabel?: string;
  onAction?: () => void;
  /** Optional secondary text link under the button. */
  secondaryLabel?: string;
  onSecondary?: () => void;
  /** Bigger version used for full-view empty states (board with 0 tasks, etc.). */
  size?: 'sm' | 'md';
  children?: ReactNode;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  actionLabel,
  onAction,
  secondaryLabel,
  onSecondary,
  size = 'md',
  children,
}: EmptyStateProps) {
  const isSmall = size === 'sm';
  return (
    <div
      className={`flex flex-col items-center text-center ${
        isSmall ? 'py-10 px-4' : 'py-16 px-6'
      }`}
    >
      <div
        className={`${
          isSmall ? 'w-12 h-12 mb-3' : 'w-16 h-16 mb-4'
        } rounded-2xl bg-brand-gradient/10 flex items-center justify-center relative`}
      >
        {/* Soft halo */}
        <span
          aria-hidden="true"
          className="absolute inset-0 rounded-2xl bg-brand-gradient opacity-10"
        />
        <Icon className={`${isSmall ? 'w-5 h-5' : 'w-7 h-7'} text-primary relative`} />
      </div>
      <h3 className={`${isSmall ? 'text-sm' : 'text-base'} font-semibold`}>
        {title}
      </h3>
      <p
        className={`${
          isSmall ? 'text-xs max-w-xs' : 'text-sm max-w-md'
        } text-muted-foreground mt-1`}
      >
        {description}
      </p>
      {(actionLabel || secondaryLabel) && (
        <div className="flex flex-col items-center gap-1.5 mt-5">
          {actionLabel && onAction && (
            <Button
              onClick={onAction}
              className="h-10 px-5 rounded-lg bg-brand-gradient text-white hover:brightness-105 shadow-md shadow-primary/20 hover:shadow-primary/30 hover:-translate-y-0.5 transition-all"
            >
              {actionLabel}
            </Button>
          )}
          {secondaryLabel && onSecondary && (
            <button
              onClick={onSecondary}
              className="text-xs text-muted-foreground hover:text-foreground mt-1"
            >
              {secondaryLabel}
            </button>
          )}
        </div>
      )}
      {children && <div className="mt-5">{children}</div>}
    </div>
  );
}
