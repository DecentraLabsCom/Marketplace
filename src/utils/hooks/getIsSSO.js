import { useUser } from '@/context/UserContext'

/**
 * Utility to get isSSO from context or options (for use outside UserContext)
 * 
 * This helper is designed for router hooks that need to determine user authentication type
 * but may be called before UserContext is fully initialized (e.g., within UserContext itself).
 * 
 * @param {Object} options - Options that may contain isSSO
 * @param {boolean} [options.isSSO] - Optional: explicit isSSO value to override context
 * @returns {boolean} isSSO value
 * @throws {Error} If isSSO not available from context or options
 * 
 * @example
 * // Within a router hook that may be used inside or outside UserContext
 * export const useMyRouter = (options = {}) => {
 *   const isSSO = getIsSSO(options);
 *   return isSSO ? useMySSOVariant(options) : useMyWalletVariant(options);
 * };
 * 
 * @example
 * // Explicit isSSO when context not available (e.g., in UserContext initialization)
 * const currentIsSSO = Boolean(ssoData?.isSSO);
 * useMyRouter({ isSSO: currentIsSSO, ...otherOptions });
 */
export function getIsSSO(options = {}) {
  // If explicit isSSO provided in options, use it directly (highest priority)
  if (options.isSSO !== undefined) {
    return options.isSSO;
  }
  
  // Try to get isSSO from context
  let contextIsSSO = null;
  try {
    const context = useUser();
    contextIsSSO = context?.isSSO;
  } catch (e) {
    // Context not available (e.g., called from UserContext itself during initialization)
    // This is expected and handled below
  }
  
  // If we got isSSO from context, use it
  if (contextIsSSO !== null && contextIsSSO !== undefined) {
    return contextIsSSO;
  }
  
  // No isSSO available - throw helpful error
  throw new Error(
    'Router hook: isSSO not available from context or options. ' +
    'Either use within UserContextProvider or pass isSSO in options.'
  );
}
