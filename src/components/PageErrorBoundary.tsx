import { Component, type ErrorInfo, type ReactNode } from 'react'

type Props = { children: ReactNode }

type State = {
  hasError: boolean
  error: Error | null
}

export class PageErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('PageErrorBoundary:', error, info.componentStack)
  }

  reset = () => {
    this.setState({ hasError: false, error: null })
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          className="flex min-h-[50vh] flex-1 flex-col items-center justify-center px-4 py-12"
          style={{ backgroundColor: '#0A0F1E' }}
        >
          <div
            className="w-full max-w-md rounded-lg border p-4"
            style={{
              backgroundColor: '#111827',
              borderColor: '#1C2840',
            }}
            role="alert"
          >
            <p className="text-[13px] font-semibold text-white">
              This page ran into an error
            </p>
            {this.state.error?.message ? (
              <p
                className="mt-2 text-xs leading-snug"
                style={{ color: '#888780' }}
              >
                {this.state.error.message}
              </p>
            ) : null}
            <button
              type="button"
              onClick={this.reset}
              className="mt-4 w-full rounded-lg border-2 border-[#F5A623] bg-transparent py-2.5 text-xs font-semibold text-[#F5A623] transition-colors hover:bg-[#F5A623]/10"
            >
              Try again
            </button>
            <a
              href="/today"
              className="mt-3 block text-center text-xs font-semibold text-zinc-400 underline-offset-2 hover:text-white hover:underline"
            >
              Go to Today
            </a>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
