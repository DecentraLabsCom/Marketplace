"use client";
import React from 'react'
import PropTypes from 'prop-types'

/**
 * SimulationErrorBoundary — catches render errors in simulation components
 * and displays a user-friendly fallback instead of crashing the whole page.
 */
export default class SimulationErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    // eslint-disable-next-line no-console
    console.error('[SimulationErrorBoundary]', error, errorInfo)
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null })
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="bg-error-bg border border-error-border rounded-lg p-6 max-w-lg mx-auto mt-8">
          <h2 className="text-error-text text-xl font-semibold mb-2">Simulation Error</h2>
          <p className="text-error-text mb-4">
            Something went wrong rendering the simulation interface.
          </p>
          {this.state.error?.message && (
            <pre className="text-xs text-error-text bg-black/10 rounded p-2 mb-4 overflow-x-auto">
              {this.state.error.message}
            </pre>
          )}
          <button
            onClick={this.handleRetry}
            className="bg-error text-white px-4 py-2 rounded hover:bg-error-dark transition-colors"
          >
            Try Again
          </button>
        </div>
      )
    }

    return this.props.children
  }
}

SimulationErrorBoundary.propTypes = {
  children: PropTypes.node.isRequired,
}
