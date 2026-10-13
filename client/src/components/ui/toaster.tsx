import { CheckCircle2, AlertTriangle, Trash2, Info, AlertOctagon } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Toast, ToastClose, ToastDescription, ToastProvider, ToastTitle, ToastViewport } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

const TOAST_DURATION_MS = 4000;

type ToastVariant = "default" | "destructive" | "info" | "warning";

/**
 * Pick a leading icon based on the variant, with a small bit of intent
 * detection for destructive toasts: a "deleted/removed/archived" message
 * gets the trash icon, anything else (failures, errors) keeps the
 * alert-octagon icon. Keeps the call sites unchanged.
 */
function pickIcon(variant: ToastVariant, title?: string): LucideIcon {
  if (variant === "destructive") {
    const t = (title ?? "").toLowerCase();
    if (/delete|remove|discard|archive|trash|cancell?ed|cleared/.test(t)) {
      return Trash2;
    }
    return AlertOctagon;
  }
  if (variant === "warning") return AlertTriangle;
  if (variant === "info") return Info;
  return CheckCircle2;
}

const ICON_COLOR: Record<ToastVariant, string> = {
  default: "text-emerald-500",
  destructive: "text-destructive",
  info: "text-blue-500",
  warning: "text-amber-500",
};

const PROGRESS_BG: Record<ToastVariant, string> = {
  default: "bg-emerald-500/80",
  destructive: "bg-destructive/70",
  info: "bg-blue-500/80",
  warning: "bg-amber-500/80",
};

export function Toaster() {
  const { toasts } = useToast();

  return (
    <ToastProvider duration={TOAST_DURATION_MS}>
      {toasts.map(function ({ id, title, description, action, variant, ...props }) {
        const v: ToastVariant = (variant ?? "default") as ToastVariant;
        const titleText = typeof title === "string" ? title : undefined;
        const Icon = pickIcon(v, titleText);
        return (
          <Toast key={id} variant={variant} {...props}>
            <Icon className={cn("w-5 h-5 shrink-0 mt-0.5", ICON_COLOR[v])} />
            <div className="grid gap-1 flex-1 min-w-0">
              {title && <ToastTitle>{title}</ToastTitle>}
              {description && <ToastDescription>{description}</ToastDescription>}
            </div>
            {action}
            <ToastClose />
            <span
              aria-hidden
              className={cn(
                "absolute bottom-0 left-0 right-0 h-1 origin-left animate-toast-progress",
                "group-hover:[animation-play-state:paused] group-focus-within:[animation-play-state:paused]",
                PROGRESS_BG[v]
              )}
            />
          </Toast>
        );
      })}
      <ToastViewport />
    </ToastProvider>
  );
}
