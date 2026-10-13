import { ReactNode } from 'react';
import {
  Dialog,
  DialogContent,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ArrowLeft, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface WizardModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  subtitle?: string;
  totalSteps: number;
  currentStepIndex: number;
  canGoBack: boolean;
  onBack: () => void;
  size?: 'md' | 'lg' | 'xl';
  children: ReactNode;
}

const sizeMap: Record<NonNullable<WizardModalProps['size']>, string> = {
  md: 'sm:max-w-md',
  lg: 'sm:max-w-lg',
  xl: 'sm:max-w-2xl',
};

export function WizardModal({
  open,
  onOpenChange,
  title,
  subtitle,
  totalSteps,
  currentStepIndex,
  canGoBack,
  onBack,
  size = 'lg',
  children,
}: WizardModalProps) {
  const progress = ((currentStepIndex + 1) / totalSteps) * 100;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        hideClose
        className={cn('p-0 gap-0 overflow-hidden', sizeMap[size])}
      >
        {/* Header */}
        <div className="px-6 pt-5 pb-4 border-b border-border">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div className="flex items-center gap-3 min-w-0">
              {canGoBack && (
                <button
                  onClick={onBack}
                  className="w-7 h-7 rounded-md hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
                  aria-label="Back"
                >
                  <ArrowLeft className="w-4 h-4" />
                </button>
              )}
              <div className="min-w-0">
                <h2 className="text-base font-semibold truncate">{title}</h2>
                {subtitle && (
                  <p className="text-xs text-muted-foreground truncate">{subtitle}</p>
                )}
              </div>
            </div>
            <button
              onClick={() => onOpenChange(false)}
              className="w-7 h-7 rounded-md hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors shrink-0"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Progress bar */}
          <div className="flex items-center gap-2">
            <div className="flex-1 h-1 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-brand-gradient transition-all duration-300 rounded-full"
                style={{ width: `${progress}%` }}
              />
            </div>
            <span className="text-[10px] font-medium text-muted-foreground tabular-nums">
              {currentStepIndex + 1}/{totalSteps}
            </span>
          </div>
        </div>

        {/* Step content */}
        <div className="px-6 py-5 max-h-[70vh] overflow-y-auto">{children}</div>
      </DialogContent>
    </Dialog>
  );
}

interface WizardFooterProps {
  onCancel?: () => void;
  onBack?: () => void;
  onNext: () => void;
  nextLabel?: string;
  nextDisabled?: boolean;
  nextVariant?: 'primary' | 'destructive';
  showBack?: boolean;
  cancelLabel?: string;
  isSubmitting?: boolean;
}

export function WizardFooter({
  onCancel,
  onBack,
  onNext,
  nextLabel = 'Next',
  nextDisabled,
  nextVariant = 'primary',
  showBack = false,
  cancelLabel = 'Cancel',
  isSubmitting = false,
}: WizardFooterProps) {
  return (
    <div className="flex items-center justify-between gap-2 px-6 py-4 border-t border-border bg-muted/20">
      <div>
        {onCancel && (
          <Button variant="ghost" onClick={onCancel} className="h-10">
            {cancelLabel}
          </Button>
        )}
      </div>
      <div className="flex items-center gap-2">
        {showBack && onBack && (
          <Button variant="outline" onClick={onBack} className="h-10 rounded-lg">
            Back
          </Button>
        )}
        <Button
          onClick={onNext}
          disabled={nextDisabled || isSubmitting}
          className={
            nextVariant === 'destructive'
              ? 'h-10 rounded-lg bg-destructive text-destructive-foreground hover:bg-destructive/90'
              : 'h-10 px-5 rounded-lg bg-brand-gradient text-white hover:brightness-105 shadow-md shadow-primary/20 hover:shadow-primary/30 hover:-translate-y-0.5 transition-all'
          }
        >
          {nextLabel}
        </Button>
      </div>
    </div>
  );
}

export function WizardOption({
  icon,
  title,
  description,
  selected = false,
  onClick,
  tone,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  selected?: boolean;
  onClick: () => void;
  /** Tailwind classes for the icon tile when not selected. Defaults to muted. */
  tone?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'w-full text-left flex items-start gap-3 rounded-xl border p-4 transition-all',
        selected
          ? 'border-primary bg-primary/5 ring-2 ring-primary/20'
          : 'border-border hover:border-slate-300 hover:bg-muted/30'
      )}
    >
      <span
        className={cn(
          'w-9 h-9 rounded-lg flex items-center justify-center shrink-0 transition-colors',
          selected
            ? 'bg-primary text-primary-foreground'
            : tone ?? 'bg-muted text-muted-foreground'
        )}
      >
        {icon}
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium">{title}</div>
        <div className="text-xs text-muted-foreground leading-snug mt-0.5">
          {description}
        </div>
      </div>
    </button>
  );
}

export function WizardSuccess({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center text-center py-6">
      <div className="w-14 h-14 rounded-full bg-brand-gradient flex items-center justify-center mb-4 shadow-lg shadow-primary/30">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          className="w-7 h-7 text-white"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M5 12l5 5L20 7" />
        </svg>
      </div>
      <h3 className="text-lg font-semibold">{title}</h3>
      {description && (
        <p className="text-sm text-muted-foreground mt-1 max-w-sm">{description}</p>
      )}
      {children && <div className="mt-4 w-full">{children}</div>}
    </div>
  );
}
