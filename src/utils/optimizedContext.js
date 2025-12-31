/**
 * Optimized Context Pattern - Base utilities for memory-efficient contexts
 */
import React, { useMemo, createContext, useContext } from 'react'
import PropTypes from 'prop-types'
import devLog from '@/utils/dev/logger'



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
  }, [valueFactory, ...dependencies]);
};




