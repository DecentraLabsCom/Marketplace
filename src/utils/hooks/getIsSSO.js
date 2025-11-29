import { useOptionalUser } from '@/context/UserContext'

/**
 * Hook to get isSSO from context or options (for use in router hooks)
 * 
 * This helper is designed for router hooks that need to determine user authentication type.
 * It follows React Hook rules by being a proper custom hook (starts with "use").
 * 
 * IMPORTANT: This hook is safe to use inside UserContext initialization because:
 * 1. It checks for explicit isSSO in options first
 * 2. It gracefully handles context not being available with try-catch
 * 3. It supports a fallbackDuringInit option for use during context initialization
 * 
 * @param {Object} options - Options that may contain isSSO
 * @param {boolean} [options.isSSO] - Optional: explicit isSSO value to override context
 * @param {boolean} [options.fallbackDuringInit] - Optional: fallback value during context initialization
 * @returns {boolean} isSSO value
 * @throws {Error} If isSSO not available from context or options (and no fallback provided)
 * 
 * @example
 * // Within a router hook
 * export const useMyRouter = (options = {}) => {
 *   const isSSO = useGetIsSSO(options);
 *   return isSSO ? useMySSOVariant(options) : useMyWalletVariant(options);
 * };
 * 
 * @example
 * // With explicit isSSO override (safe for use in UserContext initialization)
 * const result = useMyRouter({ isSSO: true, ...otherOptions });
 * 
 * @example
 * // With fallback during initialization (returns false if context not ready)
 * const isSSO = useGetIsSSO({ fallbackDuringInit: false });
 */
export function useGetIsSSO(options = {}) {
  const context = useOptionalUser()
  return resolveIsSSOValue(options, context?.isSSO)
}

/**
 * Non-hook helper for environments where React context is unavailable.
 * Useful for SSR utilities or initialization code.
 */
export function getIsSSOFromOptions(options = {}) {
  return resolveIsSSOValue(options)
}

function resolveIsSSOValue(options = {}, contextIsSSO) {
  // 1. Check for explicit isSSO override
  if (options.isSSO !== undefined) {
    return options.isSSO
  }

  // 2. Check if context provides isSSO
  if (contextIsSSO !== undefined && contextIsSSO !== null) {
    return contextIsSSO
  }

  // 3. Check for fallback during initialization
  // This allows hooks to work during UserContext initialization
  if (options.fallbackDuringInit !== undefined) {
    return options.fallbackDuringInit
  }

  throw new Error(
    'Router hook: isSSO not available from context or options. ' +
    'Either ensure UserContextProvider is mounted or pass isSSO explicitly in options.'
  )
}
