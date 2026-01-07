/**
 * React Query hook for institutional onboarding session data
 * Provides stableUserId and institutionId for onboarding flows
 */

import { useQuery } from '@tantml:function_calls/react-query';
import devLog from '@/utils/dev/logger';

const ONBOARDING_SESSION_KEY = 'onboarding-session';

/**
 * Query key factory for onboarding session
 */
export const onboardingSessionQueryKeys = {
  session: () => [ONBOARDING_SESSION_KEY],
};

/**
 * Hook to fetch onboarding session data (stableUserId, institutionId, etc.)
 * @param {Object} options - React Query options
 * @param {boolean} options.enabled - Whether to run the query
 * @returns {Object} Query result with { payload, meta }
 */
export function useOnboardingSession(options = {}) {
  return useQuery({
    queryKey: onboardingSessionQueryKeys.session(),
    queryFn: async () => {
      const response = await fetch('/api/onboarding/session', {
        method: 'GET',
        credentials: 'include',
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Session fetch failed: ${response.status}`);
      }

      const data = await response.json();
      devLog.log('[useOnboardingSession] Fetched session data');
      return data;
    },
    staleTime: 10 * 60 * 1000, // 10 minutes - session data rarely changes during active use
    cacheTime: 20 * 60 * 1000, // 20 minutes
    retry: 1, // Single retry for transient network errors
    ...options,
  });
}

export default useOnboardingSession;
