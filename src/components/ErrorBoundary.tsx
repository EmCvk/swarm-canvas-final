import { Component, ErrorInfo, ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
  name?: string;
  fallback?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class PanelErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  public state: ErrorBoundaryState = {
    hasError: false,
    error: null,
  };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[SwarmCanvas] ${this.props.name ?? 'Panel'} crashed`, error, info.componentStack);
  }

  private handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    if (this.props.fallback) return this.props.fallback;

    const name = this.props.name ?? 'Panel';
    const message = this.state.error?.message || 'An unexpected rendering error occurred.';

    return (
      <div className="h-full w-full flex items-center justify-center p-6 bg-black/20">
        <div className="w-full max-w-md rounded-2xl bg-zinc-950/95 p-5 shadow-2xl ring-1 ring-rose-500/30">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-rose-500/15 text-rose-300">
              <span className="text-sm font-bold">!</span>
            </div>
            <div className="min-w-0">
              <div className="font-semibold text-zinc-100">{name} encountered an error</div>
              <div className="mt-1 text-xs leading-5 text-zinc-400">{message}</div>
            </div>
          </div>

          <div className="mt-4 flex items-center gap-2">
            <button
              type="button"
              onClick={this.handleRetry}
              className="sc-action-button sc-action-danger rounded-lg px-3 py-2 text-xs font-medium"
            >
              Retry panel
            </button>
          </div>
        </div>
      </div>
    );
  }
}
