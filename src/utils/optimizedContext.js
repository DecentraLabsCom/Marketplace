/**
 * Optimized Context Pattern - Base utilities for memory-efficient contexts
 */
import React, { useMemo, createContext, useContext, useState, useEffect } from 'react'
import devLog from '@/utils/dev/logger'

/**
 * Creates an optimized context with automatic memoization
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
 */
export const createOptimizedContext = (contextName) => {
  const Context = createContext();
  Context.displayName = contextName;
  
  const Provider = ({ value, children }) => {
    const memoizedValue = useMemo(() => value, [value]);
    return <Context.Provider value={memoizedValue}>{children}</Context.Provider>;
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

/**
 * Higher-order component for context optimization
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
 */
export const useOptimizedCallback = (callback, dependencies = []) => {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => callback, [callback, ...dependencies]);
};

/**
 * Hook for memoizing context values with debugging
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
