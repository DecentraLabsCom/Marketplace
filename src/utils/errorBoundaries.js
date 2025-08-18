/**
 * Error Boundary System with Tiered Error Handling
 * Provides robust error boundaries and hierarchical error handling
 */
import React from 'react'
import PropTypes from 'prop-types'
import devLog from '@/utils/dev/logger'

/**
 * Error Severity Levels
 */
export const ErrorSeverity = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  CRITICAL: 'critical'
};

/**
 * Error Categories
 */
export const ErrorCategory = {
  NETWORK: 'network',
  BLOCKCHAIN: 'blockchain',
  VALIDATION: 'validation',
  AUTHENTICATION: 'authentication',
  PERMISSIONS: 'permissions',
  BUSINESS_LOGIC: 'business_logic',
  UI: 'ui',
  UNKNOWN: 'unknown'
};

/**
 * Enhanced Error class with metadata
 */
export class EnhancedError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = 'EnhancedError';
    this.severity = options.severity || ErrorSeverity.MEDIUM;
    this.category = options.category || ErrorCategory.UNKNOWN;
    this.context = options.context || {};
    this.userMessage = options.userMessage || 'An unexpected error occurred';
    this.recoverable = options.recoverable !== false; // Default to recoverable
    this.timestamp = new Date().toISOString();
    this.stack = this.stack || new Error().stack;
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      severity: this.severity,
      category: this.category,
      context: this.context,
      userMessage: this.userMessage,
      recoverable: this.recoverable,
      timestamp: this.timestamp,
      stack: this.stack
    };
  }
}

/**
 * Error Handler Class
 */
class ErrorHandler {
  constructor() {
    this.errorListeners = [];
    this.globalErrorHandlers = new Map();
    this.errorHistory = [];
    this.maxHistorySize = 100;
  }

  /**
   * Register a global error handler for a specific category
   */
  registerHandler(category, handler) {
    this.globalErrorHandlers.set(category, handler);
    devLog.log(`Error handler registered for category: ${category}`);
  }

  /**
   * Add error listener
   */
  addErrorListener(listener) {
    this.errorListeners.push(listener);
  }

  /**
   * Remove error listener
   */
  removeErrorListener(listener) {
    const index = this.errorListeners.indexOf(listener);
    if (index > -1) {
      this.errorListeners.splice(index, 1);
    }
  }

  /**
   * Handle error with automatic categorization and routing
   */
  handleError(error, context = {}) {
    // Enhance error if it's not already enhanced
    if (!(error instanceof EnhancedError)) {
      error = this.enhanceError(error, context);
    }

    // Add to history
    this.addToHistory(error);

    // Log error
    this.logError(error);

    // Notify listeners
    this.notifyListeners(error);

    // Try category-specific handler
    const categoryHandler = this.globalErrorHandlers.get(error.category);
    if (categoryHandler) {
      try {
        const handled = categoryHandler(error);
        if (handled) {
          devLog.log(`Error handled by category handler: ${error.category}`);
          return;
        }
      } catch (handlerError) {
        devLog.error('Error in category handler:', handlerError);
      }
    }

    // Default handling based on severity
    this.handleBySeverity(error);
  }

  /**
   * Enhance regular error to EnhancedError
   */
  enhanceError(error, context = {}) {
    let category = ErrorCategory.UNKNOWN;
    let severity = ErrorSeverity.MEDIUM;
    let userMessage = 'An unexpected error occurred';
    let recoverable = true;

    // Handle empty/meaningless error objects (React Query sometimes sends these)
    if (!error || (typeof error === 'object' && Object.keys(error).length === 0)) {
      devLog.warn('Skipping empty/meaningless error object in enhanceError');
      return new EnhancedError('Empty error object', {
        severity: ErrorSeverity.LOW,
        category: ErrorCategory.UI,
        context: { ...context, originalError: error, skipped: true },
        userMessage: 'A minor error occurred but has been handled',
        recoverable: true
      });
    }

    // Extract error message, handling various error types
    let errorMessage = 'Unknown error';
    if (typeof error === 'string') {
      errorMessage = error;
    } else if (error?.message) {
      errorMessage = error.message;
    } else if (error?.error) {
      errorMessage = error.error;
    } else if (error?.toString && typeof error.toString === 'function') {
      errorMessage = error.toString();
    }

    // Auto-categorize based on error message/type
    if (errorMessage.includes('fetch') || errorMessage.includes('network')) {
      category = ErrorCategory.NETWORK;
      userMessage = 'Network connection error. Please check your internet connection.';
    } else if (errorMessage.includes('blockchain') || errorMessage.includes('transaction')) {
      category = ErrorCategory.BLOCKCHAIN;
      severity = ErrorSeverity.HIGH;
      userMessage = 'Blockchain transaction error. Please try again.';
    } else if (errorMessage.includes('validation') || errorMessage.includes('invalid')) {
      category = ErrorCategory.VALIDATION;
      severity = ErrorSeverity.LOW;
      userMessage = 'Please check your input and try again.';
    } else if (errorMessage.includes('auth') || errorMessage.includes('unauthorized')) {
      category = ErrorCategory.AUTHENTICATION;
      severity = ErrorSeverity.HIGH;
      userMessage = 'Authentication required. Please log in again.';
      recoverable = false;
    }

    return new EnhancedError(errorMessage, {
      severity,
      category,
      context: { ...context, originalError: error },
      userMessage,
      recoverable
    });
  }

  /**
   * Handle error based on severity
   */
  handleBySeverity(error) {
    switch (error.severity) {
      case ErrorSeverity.LOW:
        // Just log, maybe show a toast
        devLog.warn('Low severity error:', error.message);
        break;
        
      case ErrorSeverity.MEDIUM:
        // Show user notification
        devLog.error('Medium severity error:', error.message);
        break;
        
      case ErrorSeverity.HIGH:
        // Show error modal, may require user action
        devLog.error('High severity error:', error.message);
        break;
        
      case ErrorSeverity.CRITICAL:
        // Show critical error screen, may require page reload
        devLog.error('CRITICAL ERROR:', error.message);
        break;
    }
  }

  /**
   * Add error to history
   */
  addToHistory(error) {
    this.errorHistory.unshift(error);
    
    // Limit history size
    if (this.errorHistory.length > this.maxHistorySize) {
      this.errorHistory = this.errorHistory.slice(0, this.maxHistorySize);
    }
  }

  /**
   * Log error with appropriate level
   */
  logError(error) {
    const logData = {
      message: error.message,
      severity: error.severity,
      category: error.category,
      context: error.context,
      timestamp: error.timestamp
    };

    switch (error.severity) {
      case ErrorSeverity.LOW:
        devLog.warn('Error (LOW):', logData);
        break;
      case ErrorSeverity.MEDIUM:
        devLog.error('Error (MEDIUM):', logData);
        break;
      case ErrorSeverity.HIGH:
        devLog.error('Error (HIGH):', logData);
        break;
      case ErrorSeverity.CRITICAL:
        devLog.error('Error (CRITICAL):', logData);
        break;
    }
  }

  /**
   * Notify all error listeners
   */
  notifyListeners(error) {
    this.errorListeners.forEach(listener => {
      try {
        listener(error);
      } catch (listenerError) {
        devLog.error('Error in error listener:', listenerError);
      }
    });
  }

  /**
   * Get error statistics
   */
  getStats() {
    const stats = {
      total: this.errorHistory.length,
      bySeverity: {},
      byCategory: {},
      recent: this.errorHistory.slice(0, 10)
    };

    // Count by severity and category
    this.errorHistory.forEach(error => {
      stats.bySeverity[error.severity] = (stats.bySeverity[error.severity] || 0) + 1;
      stats.byCategory[error.category] = (stats.byCategory[error.category] || 0) + 1;
    });

    return stats;
  }

  /**
   * Clear error history
   */
  clearHistory() {
    this.errorHistory = [];
    devLog.log('Error history cleared');
  }
}

// Global error handler instance
export const globalErrorHandler = new ErrorHandler();

/**
 * React Error Boundary Component
 * Catches JavaScript errors anywhere in the child component tree and displays a fallback UI
 * @class ErrorBoundary
 * @param {Object} props
 * @param {React.ReactNode} props.children - Child components to wrap with error boundary
 * @param {Function} [props.fallback] - Function that receives (error, errorInfo) and returns JSX fallback UI
 * @param {string} [props.name] - Name identifier for the error boundary
 * @param {string} [props.severity] - Error severity level from ErrorSeverity enum
 * @param {string} [props.category] - Error category from ErrorCategory enum
 * @param {string} [props.userMessage] - User-friendly error message
 * @param {boolean} [props.recoverable=true] - Whether the error is recoverable with "Try Again"
 * @param {Function} [props.onError] - Custom error handler function
 * @param {Object} [props.errorContext] - Additional context for error logging
 */
export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null
    };
  }

  static getDerivedStateFromError(error) {
    return {
      hasError: true,
      error
    };
  }

  componentDidCatch(error, errorInfo) {
    // Create enhanced error
    const enhancedError = new EnhancedError(error.message, {
      severity: this.props.severity || ErrorSeverity.HIGH,
      category: this.props.category || ErrorCategory.UI,
      context: {
        componentStack: errorInfo.componentStack,
        errorBoundary: this.props.name || 'Unknown',
        props: this.props.errorContext || {}
      },
      userMessage: this.props.userMessage || 'A component error occurred',
      recoverable: this.props.recoverable !== false
    });

    // Handle the error
    globalErrorHandler.handleError(enhancedError);

    // Update state
    this.setState({
      error: enhancedError,
      errorInfo
    });

    // Call custom error handler if provided
    if (this.props.onError) {
      this.props.onError(enhancedError, errorInfo);
    }
  }

  render() {
    if (this.state.hasError) {
      // Custom fallback UI
      if (this.props.fallback && typeof this.props.fallback === 'function') {
        return this.props.fallback(this.state.error, this.state.errorInfo);
      }

      // Default fallback UI
      return (
        <div className="p-6 bg-red-50 border border-red-200 rounded-lg">
          <h2 className="text-lg font-semibold text-red-800 mb-2">
            Something went wrong
          </h2>
          <p className="text-red-600 mb-4">
            {this.state.error?.userMessage || 'An unexpected error occurred'}
          </p>
          
          {this.state.error?.recoverable && (
            <button
              onClick={() => this.setState({ hasError: false, error: null, errorInfo: null })}
              className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
            >
              Try Again
            </button>
          )}
          
          {process.env.NODE_ENV === 'development' && (
            <details className="mt-4">
              <summary className="cursor-pointer text-sm text-red-700">
                Technical Details
              </summary>
              <pre className="mt-2 text-xs text-red-600 overflow-auto">
                {this.state.error?.stack}
              </pre>
            </details>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}

// PropTypes for ErrorBoundary
ErrorBoundary.propTypes = {
  children: PropTypes.node.isRequired,
  fallback: PropTypes.func, // Function that receives (error, errorInfo) and returns JSX
  name: PropTypes.string,
  severity: PropTypes.oneOf(Object.values(ErrorSeverity)),
  category: PropTypes.oneOf(Object.values(ErrorCategory)),
  userMessage: PropTypes.string,
  recoverable: PropTypes.bool,
  onError: PropTypes.func,
  errorContext: PropTypes.object
};

/**
 * Higher-Order Component for Error Boundaries
 * Wraps a component with error boundary functionality
 * @param {React.Component} WrappedComponent - Component to wrap with error boundary
 * @param {Object} errorBoundaryProps - Props to pass to the ErrorBoundary component
 * @returns {React.Component} Component wrapped with error boundary protection
 */
export function withErrorBoundary(WrappedComponent, errorBoundaryProps = {}) {
  const WithErrorBoundaryComponent = React.forwardRef((props, ref) => (
    <ErrorBoundary {...errorBoundaryProps}>
      <WrappedComponent {...props} ref={ref} />
    </ErrorBoundary>
  ));

  WithErrorBoundaryComponent.displayName = 
    `withErrorBoundary(${WrappedComponent.displayName || WrappedComponent.name})`;

  return WithErrorBoundaryComponent;
}

/**
 * Hook for handling errors in functional components
 * Provides error handling functions that integrate with the global error system
 * @returns {Object} Object containing error handling functions
 * @returns {Function} returns.handleError - Function to handle errors with optional context
 * @returns {Function} returns.createErrorHandler - Function that creates error handlers with preset context
 */
export function useErrorHandler() {
  const handleError = React.useCallback((error, context = {}) => {
    globalErrorHandler.handleError(error, context);
  }, []);

  const createErrorHandler = React.useCallback((context = {}) => {
    return (error) => handleError(error, context);
  }, [handleError]);

  return { handleError, createErrorHandler };
}

/**
 * Hook for async error handling
 * Provides utilities for handling errors in async operations
 * @returns {Object} Object containing async error handling utilities
 * @returns {Function} returns.executeAsync - Function to execute async operations with error handling
 * @returns {Function} returns.handleAsyncError - Function to handle async errors
 */
export function useAsyncError() {
  const { handleError } = useErrorHandler();

  const executeAsync = React.useCallback(async (asyncFn, context = {}) => {
    try {
      return await asyncFn();
    } catch (error) {
      handleError(error, { ...context, async: true });
      throw error; // Re-throw so caller can handle if needed
    }
  }, [handleError]);

  return executeAsync;
}

// Export common error creators
export const createNetworkError = (message, context = {}) => 
  new EnhancedError(message, {
    severity: ErrorSeverity.MEDIUM,
    category: ErrorCategory.NETWORK,
    userMessage: 'Network error. Please check your connection.',
    ...context
  });

export const createBlockchainError = (message, context = {}) => 
  new EnhancedError(message, {
    severity: ErrorSeverity.HIGH,
    category: ErrorCategory.BLOCKCHAIN,
    userMessage: 'Blockchain transaction failed. Please try again.',
    ...context
  });

export const createValidationError = (message, context = {}) => 
  new EnhancedError(message, {
    severity: ErrorSeverity.LOW,
    category: ErrorCategory.VALIDATION,
    userMessage: 'Please check your input and try again.',
    ...context
  });
