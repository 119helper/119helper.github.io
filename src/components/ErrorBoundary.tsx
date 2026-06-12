import { Component, type ErrorInfo, type ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallbackTitle?: string;
  fallbackDescription?: string;
  resetKey?: string;
}

interface ErrorBoundaryState {
  error: Error | null;
}

export default class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[ErrorBoundary]', error, errorInfo);
  }

  componentDidUpdate(prevProps: ErrorBoundaryProps) {
    if (this.state.error && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  private retry = () => {
    this.setState({ error: null });
  };

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="min-h-[320px] w-full flex items-center justify-center p-4">
        <div className="w-full max-w-xl rounded-lg border border-error/30 bg-error/10 p-6 text-on-surface shadow-lg">
          <div className="flex items-start gap-4">
            <span className="material-symbols-outlined text-error text-3xl">error</span>
            <div className="min-w-0 flex-1">
              <h2 className="text-lg font-bold text-on-surface">
                {this.props.fallbackTitle || '화면을 불러오지 못했습니다'}
              </h2>
              <p className="mt-2 text-sm leading-6 text-on-surface-variant">
                {this.props.fallbackDescription || '이 화면에서 오류가 발생했습니다. 다른 기능은 계속 사용할 수 있습니다.'}
              </p>
              <p className="mt-3 rounded-lg bg-surface-container-high px-3 py-2 text-xs text-on-surface-variant break-words">
                {this.state.error.message || '알 수 없는 오류'}
              </p>
              <button
                type="button"
                onClick={this.retry}
                className="mt-4 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-on-primary hover:bg-primary/90"
              >
                <span className="material-symbols-outlined text-base">refresh</span>
                다시 시도
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }
}
