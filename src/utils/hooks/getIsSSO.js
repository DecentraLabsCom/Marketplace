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
 * 
 * @param {Object} options - Options that may contain isSSO
 * @param {boolean} [options.isSSO] - Optional: explicit isSSO value to override context
 * @returns {boolean} isSSO value
 * @throws {Error} If isSSO not available from context or options
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
  if (options.isSSO !== undefined) {
    return options.isSSO
  }

  if (contextIsSSO !== undefined && contextIsSSO !== null) {
    return contextIsSSO
  }

  throw new Error(
    'Router hook: isSSO not available from context or options. ' +
    'Either ensure UserContextProvider is mounted or pass isSSO explicitly in options.'
  )
}
