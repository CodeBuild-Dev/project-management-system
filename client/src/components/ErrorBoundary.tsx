import { Component, ErrorInfo, ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { AlertTriangle, RefreshCcw } from 'lucide-react';

interface Props {
  children: ReactNode;
  /** Optional friendly label shown to the user. */
  label?: string;
}

interface State {
  error: Error | null;
}

/**
 * Catches render-phase errors and shows a friendly fallback with a reload option.
 * Wraps the authenticated app shell so a single broken component doesn't blank the page.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Swap for a real logger when backend lands (Sentry / tRPC audit).
    // eslint-disable-next-line no-console
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  reset = () => this.setState({ error: null });

  reload = () => {
    this.reset();
    if (typeof window !== 'undefined') window.location.reload();
  };

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="min-h-screen flex items-center justify-center bg-muted p-6">
        <div className="w-full max-w-md bg-card border border-border rounded-2xl shadow-sm p-6 text-center">
          <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center mx-auto mb-4">
            <AlertTriangle className="w-6 h-6 text-destructive" />
          </div>
          <h2 className="text-lg font-semibold">Something went wrong</h2>
          <p className="text-sm text-muted-foreground mt-1 mb-5">
            {this.props.label ?? 'An unexpected error broke this view.'} The rest of your work is safe.
          </p>

          <details
            open
            className="text-left text-xs text-muted-foreground bg-muted/50 rounded-lg p-3 mb-5 max-h-48 overflow-y-auto"
          >
            <summary className="cursor-pointer text-foreground font-medium mb-1">
              Technical details
            </summary>
            <code className="whitespace-pre-wrap break-all block mb-2 text-foreground">
              {this.state.error.message}
            </code>
            {this.state.error.stack && (
              <code className="whitespace-pre-wrap break-all block text-[10px] opacity-70">
                {this.state.error.stack}
              </code>
            )}
          </details>

          <div className="flex items-center justify-center gap-2">
            <Button variant="outline" onClick={this.reset} className="h-10 rounded-lg">
              Try again
            </Button>
            <Button
              onClick={this.reload}
              className="h-10 rounded-lg bg-brand-gradient text-white hover:brightness-105 shadow-sm shadow-primary/20"
            >
              <RefreshCcw className="w-4 h-4" />
              Reload page
            </Button>
          </div>
        </div>
      </div>
    );
  }
}
