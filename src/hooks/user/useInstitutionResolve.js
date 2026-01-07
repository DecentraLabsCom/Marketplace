/**
 * React Query hook for institution resolution via smart contract
 * Caches the result to avoid repeated RPC calls
 */

import { useQuery } from '@tanstack/react-query';
import devLog from '@/utils/dev/logger';

const INSTITUTION_QUERY_KEY_BASE = 'institution-resolve';

/**
 * Query key factory for institution resolution
 */
export const institutionQueryKeys = {
  all: [INSTITUTION_QUERY_KEY_BASE],
  byDomain: (domain) => [INSTITUTION_QUERY_KEY_BASE, domain],
};

/**
 * Hook to resolve institution registration status from smart contract
 * @param {string} institutionDomain - Institution domain (schacHomeOrganization)
 * @param {Object} options - React Query options
 * @returns {Object} Query result with { registered, wallet, backendUrl, hasBackend }
 */
export function useInstitutionResolve(institutionDomain, options = {}) {
  return useQuery({
    queryKey: institutionQueryKeys.byDomain(institutionDomain),
    queryFn: async () => {
      if (!institutionDomain) {
        throw new Error('Institution domain is required');
      }

      const response = await fetch(
        `/api/contract/institution/resolve?domain=${encodeURIComponent(institutionDomain)}`,
        {
          method: 'GET',
          credentials: 'include',
        }
      );

      const data = await response.json().catch(() => ({}));
      
      if (!response.ok) {
        throw new Error(data.error || `Failed to resolve institution (${response.status})`);
      }

      devLog.log('[useInstitutionResolve] Resolved:', institutionDomain, data);
      return data;
    },
    enabled: Boolean(institutionDomain) && options.enabled !== false,
    staleTime: 60 * 60 * 1000, // 1 hour - institution registration rarely changes
    cacheTime: 24 * 60 * 60 * 1000, // 24 hours - keep in cache even if unmounted
    retry: 2, // Retry failed RPC calls twice
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 5000), // Exponential backoff
    ...options,
  });
}

export default useInstitutionResolve;
