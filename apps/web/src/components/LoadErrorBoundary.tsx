import { Component, type ReactNode } from 'react'
import { buttonOnLight } from './buttons'

type State = { failed: boolean }

/**
 * Catches a part of the app that failed to download (common on a weak connection) or
 * crashed, and offers a reload instead of leaving a blank screen. React only supports this
 * as a class.
 */
export class LoadErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { failed: false }

  static getDerivedStateFromError(): State {
    return { failed: true }
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <div className="flex h-full flex-col items-center justify-center gap-6 bg-white px-5 py-16 text-center text-neutral-950">
        <div>
          <h2 className="text-xl font-semibold">This page didn’t load</h2>
          <p className="mt-2 max-w-sm text-neutral-600">
            Check this computer’s internet connection, then reload the page.
          </p>
        </div>
        <button type="button" onClick={() => window.location.reload()} className={`${buttonOnLight} h-11 px-5`}>
          Reload
        </button>
      </div>
    )
  }
}
