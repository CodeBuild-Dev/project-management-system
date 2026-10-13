import { ReactNode } from 'react';
import { LoginIllustration } from '@/pages/auth/LoginIllustration';

interface AuthLayoutProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}

/**
 * Shared split-screen chrome for the secondary auth flows
 * (forgot-password, reset-password). Mirrors the Login page exactly so
 * the user never sees the brand step backwards: brand mark + form on
 * the left, gradient + LoginIllustration panel on the right, identical
 * typography + animations.
 *
 * The Login page itself doesn't use this — it has a richer set of
 * input states (TOTP, remember-me, support dialog) that warranted
 * inlining the layout. This is the trimmed version for everything else.
 */
export function AuthLayout({ title, subtitle, children, footer }: AuthLayoutProps) {
  return (
    <div className="min-h-screen bg-card grid lg:grid-cols-2">
      {/* Mobile-only gradient hairline so the brand reads even when the
          right-side panel is hidden. */}
      <div aria-hidden="true" className="h-1.5 bg-brand-gradient lg:hidden" />

      {/* Form column */}
      <div className="relative flex flex-col p-5 sm:p-8 md:p-10 lg:p-16 min-h-[calc(100vh-0.375rem)] lg:min-h-screen">
        {/* Brand mark */}
        <div className="flex items-center gap-2 animate-fade-in-up">
          <div className="w-8 h-8 bg-brand-gradient rounded-lg flex items-center justify-center shadow-md shadow-primary/30">
            <span className="text-white text-sm font-bold">S</span>
          </div>
          <span className="text-sm font-semibold">Project Management</span>
        </div>

        {/* Centered content block — same vertical rhythm as Login */}
        <div className="flex-1 flex items-center">
          <div className="w-full max-w-md mx-auto py-6 sm:py-10">
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold leading-tight tracking-tight animate-fade-in-up delay-100">
              {title}
            </h1>
            {subtitle && (
              <p className="text-sm text-muted-foreground mt-3 mb-6 sm:mb-8 animate-fade-in-up delay-200">
                {subtitle}
              </p>
            )}
            <div className="animate-fade-in-up delay-300">{children}</div>
            {footer && (
              <div className="mt-6 text-center text-sm text-muted-foreground animate-fade-in-up delay-400">
                {footer}
              </div>
            )}
          </div>
        </div>

        {/* Footer copyright pinned to the bottom on tall screens */}
        <div className="text-[11px] text-muted-foreground animate-fade-in-up delay-500">
          &copy; {new Date().getFullYear()} Project Management
        </div>
      </div>

      {/* Brand / illustration column — hidden on small screens */}
      <div className="relative hidden lg:flex bg-brand-gradient overflow-hidden items-center justify-center">
        {/* Decorative grid + soft blobs behind the illustration. The
            radial-gradient masks soften the edges so the panel doesn't
            look like a flat block. */}
        <div
          aria-hidden="true"
          className="absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              'linear-gradient(rgba(255,255,255,0.6) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.6) 1px, transparent 1px)',
            backgroundSize: '32px 32px',
          }}
        />
        <div
          aria-hidden="true"
          className="absolute -top-32 -right-32 w-96 h-96 rounded-full bg-white/10 blur-3xl"
        />
        <div
          aria-hidden="true"
          className="absolute -bottom-32 -left-32 w-96 h-96 rounded-full bg-white/10 blur-3xl"
        />
        <LoginIllustration />
      </div>
    </div>
  );
}
