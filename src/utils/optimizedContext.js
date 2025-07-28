/**
 * Optimized Context Pattern - Base utilities for memory-efficient contexts
 */
import React, { useMemo, createContext, useContext, useState, useEffect } from 'react'
import PropTypes from 'prop-types'
import devLog from '@/utils/dev/logger'

/**
 * Creates an optimized context with automatic memoization
 * Memoizes context factory results to prevent unnecessary recalculations
 * @param {Function} contextFactory - Function that creates the context value
 * @param {Array} dependencies - Dependencies array for memoization
 * @returns {any} Memoized context value from factory function
 * @throws {Error} When context factory throws an error
 */
export const useOptimizedContext = (contextFactory, dependencies = []) => {
  const contextValue = useMemo(() => {
    try {
      return contextFactory();
    } catch (error) {
      devLog.error('Context factory error:', error);
      throw error;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contextFactory, ...dependencies]);
  
  return contextValue;
};

/**
 * Creates a context with built-in error handling and optimization
 * Returns a context object with Provider, Context, and useContext hook
 * @param {string} contextName - Name of the context for debugging and error messages
 * @returns {Object} Object containing Context, Provider component, and useContext hook
 * @returns {React.Context} returns.Context - The React context object
 * @returns {React.Component} returns.Provider - Optimized provider component with memoization
 * @returns {Function} returns.useContext - Hook to consume the context with error handling
 */
export const createOptimizedContext = (contextName) => {
  const Context = createContext();
  Context.displayName = contextName;
  
  const Provider = ({ value, children }) => {
    const memoizedValue = useMemo(() => value, [value]);
    return <Context.Provider value={memoizedValue}>{children}</Context.Provider>;
  };
  
  // Add PropTypes to the Provider
  Provider.propTypes = {
    value: PropTypes.any.isRequired,
    children: PropTypes.node.isRequired
  };
  
  const useContextHook = () => {
    const context = useContext(Context);
    if (!context) {
      throw new Error(`use${contextName} must be used within a ${contextName}Provider`);
    }
    return context;
  };
  
  return { Context, Provider, useContext: useContextHook };
};

/**
 * Error Boundary for context-specific errors
 * Catches and displays context-related errors with user-friendly messages
 * @class ContextErrorBoundary
 * @extends {React.Component}
 */
class ContextErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    devLog.error(`Context error in ${this.props.contextName}:`, error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-4 bg-red-50 border border-red-200 rounded">
          <h3 className="font-semibold text-red-800">Context Error</h3>
          <p className="text-red-700 mt-1">
            Error in {this.props.contextName} context. Please refresh the page.
          </p>
        </div>
      );
    }

    return this.props.children;
  }
}

// PropTypes for ContextErrorBoundary
ContextErrorBoundary.propTypes = {
  contextName: PropTypes.string.isRequired,
  children: PropTypes.node.isRequired
}

/**
 * Higher-order component for context optimization
 * Wraps a context component with error boundary and optimization
 * @param {React.Component} ContextComponent - The context component to wrap
 * @param {string} contextName - Name of the context for error handling
 * @returns {React.Component} Optimized component wrapped with error boundary
 */
export const withOptimizedContext = (ContextComponent, contextName) => {
  const OptimizedComponent = (props) => {
    return (
      <ContextErrorBoundary contextName={contextName}>
        <ContextComponent {...props} />
      </ContextErrorBoundary>
    );
  };
  
  OptimizedComponent.displayName = `Optimized${contextName}`;
  return OptimizedComponent;
};

/**
 * Hook for memoizing callback functions in contexts
 * Prevents unnecessary re-renders by memoizing callback functions
 * @param {Function} callback - The callback function to memoize
 * @param {Array} dependencies - Dependencies array for the callback
 * @returns {Function} Memoized callback function
 */
export const useOptimizedCallback = (callback, dependencies = []) => {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => callback, [callback, ...dependencies]);
};

/**
 * Hook for memoizing context values with debugging
 * Provides performance monitoring for context value creation
 * @param {Function} valueFactory - Function that creates the context value
 * @param {Array} dependencies - Dependencies array for memoization
 * @param {string} contextName - Name of the context for debugging
 * @returns {any} Memoized context value with performance monitoring
 */
export const useOptimizedContextValue = (valueFactory, dependencies = [], contextName = '') => {
  return useMemo(() => {
    const startTime = performance.now();
    const value = valueFactory();
    const endTime = performance.now();
    
    if (endTime - startTime > 5) {
      devLog.warn(`[${contextName}] Context value creation took ${(endTime - startTime).toFixed(2)}ms`);
    }
    
    return value;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valueFactory, contextName, ...dependencies]);
};

/**
 * Hook for memoizing values with automatic optimization
 * Memoizes value creation with built-in error handling
 * @param {Function} valueFactory - Function that creates the value
 * @param {Array} dependencies - Dependencies array for memoization
 * @returns {any} Memoized value with error handling
 * @throws {Error} When value factory throws an error
 */
export const useMemoizedValue = (valueFactory, dependencies = []) => {
  return useMemo(() => {
    try {
      return valueFactory();
    } catch (error) {
      devLog.error('Memoized value creation error:', error);
      throw error;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valueFactory, ...dependencies]);
};

/**
 * Hook for debouncing values to prevent excessive updates
 * Delays value updates until after a specified delay period
 * @param {any} value - The value to debounce
 * @param {number} delay - Delay in milliseconds (default: 300ms)
 * @returns {any} Debounced value that updates after the delay period
 */
export const useDebounced = (value, delay = 300) => {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(timer);
    };
  }, [value, delay]);

  return debouncedValue;
};
