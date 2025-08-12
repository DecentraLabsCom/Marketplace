/**
 * SSR-safe utility functions
 * Ensures that client-side only operations are handled gracefully during SSR
 */

/**
 * Creates an SSR-safe wrapper for service functions that use relative URLs
 * @param {Function} serviceFunction - The service function to wrap
 * @param {*} fallbackValue - Value to return during SSR (default: empty array)
 * @returns {Function} SSR-safe wrapped function
 */
export const createSSRSafeQuery = (serviceFunction, fallbackValue = []) => {
  return async (...args) => {
    // Only execute on client side to avoid SSR issues with relative URLs
    if (typeof window === 'undefined') {
      return fallbackValue;
    }
    
    return await serviceFunction(...args);
  };
};

/**
 * Check if we're running on the client side
 * @returns {boolean} True if client-side, false if server-side
 */
export const isClientSide = () => typeof window !== 'undefined';

/**
 * Check if we're running on the server side
 * @returns {boolean} True if server-side, false if client-side
 */
export const isServerSide = () => typeof window === 'undefined';
