import { Component, type ErrorInfo, type ReactNode } from 'react'

type Props = { children: ReactNode }

type State = {
  hasError: boolean
  error: Error | null
}

const isDev =
  typeof import.meta !== 'undefined' && Boolean(import.meta.env?.DEV)

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('ErrorBoundary caught:', error, info.componentStack)
  }

  render() {
    if (this.state.hasError && this.state.error) {
      const err = this.state.error
      return (
        <div
          className="flex min-h-screen flex-col items-center justify-center px-6 py-10"
          style={{ backgroundColor: '#0A0F1E' }}
        >
          <div className="flex w-full max-w-md flex-col items-center text-center">
            <span className="text-5xl" aria-hidden>
              {'\u26A0\uFE0F'}
            </span>
            <h1 className="mt-4 text-[20px] font-bold text-white">
              Something went wrong
            </h1>
            <p
              className="mt-3 text-sm leading-relaxed"
              style={{ color: '#888780' }}
            >
              InHabit ran into an unexpected error. Your data is safe.
            </p>
            <button
              type="button"
              className="mt-8 w-full max-w-xs rounded-xl py-3.5 text-sm font-semibold text-[#0A0F1E]"
              style={{ backgroundColor: '#F5A623' }}
              onClick={() => window.location.reload()}
            >
              Reload App
            </button>
            <button
              type="button"
              className="mt-3 w-full max-w-xs rounded-xl border py-3.5 text-sm font-semibold text-white transition-colors"
              style={{
                backgroundColor: '#111827',
                borderColor: '#1C2840',
              }}
              onClick={() => {
                window.location.href = '/today'
              }}
            >
              Go to Today
            </button>
            {isDev ? (
              <div
                className="mt-8 max-h-48 w-full overflow-auto rounded-lg border bg-black/50 p-3 text-left"
                style={{ borderColor: '#1C2840' }}
              >
                <p className="break-all font-mono text-xs text-red-300">
                  {err.message}
                </p>
                {err.stack ? (
                  <pre className="mt-2 whitespace-pre-wrap break-all font-mono text-[10px] text-zinc-500">
                    {err.stack}
                  </pre>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
