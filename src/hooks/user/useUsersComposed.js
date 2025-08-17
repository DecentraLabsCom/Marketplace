/**
 * Composed React Query Hooks for User/Provider-related operations
 * These hooks use useQueries to orchestrate multiple related atomic hooks while maintaining
 * React Query's caching, error handling, and retry capabilities
 * 
 * Uses existing atomic hooks instead of direct fetch calls for consistency and shared caching
 */
import { useQueries } from '@tanstack/react-query'
import { 
  useLabProviders, 
  useIsLabProvider,
  USER_QUERY_CONFIG, // ✅ Import shared configuration
} from './useUsers'
import { providerQueryKeys } from '@/utils/hooks/queryKeys'
import devLog from '@/utils/dev/logger'

/**
 * Get formatted list of provider data including names
 * Uses getLabProviders which already includes names in the response
 */
export const useProvidersWithNames = (options = {}) => {
  const providersQuery = useLabProviders({
    ...USER_QUERY_CONFIG, // Use user/provider configuration
    // Only allow override of non-critical options like enabled, meta, etc.
    enabled: options.enabled,
    meta: options.meta,
  });

  return {
    data: providersQuery.data?.providers?.map((provider) => ({
      ...provider,
      displayName: provider.name || provider.account
    })) || [],
    isLoading: providersQuery.isLoading,
    error: providersQuery.error,
    refetch: providersQuery.refetch,
    meta: {
      totalProviders: providersQuery.data?.count || 0,
      timestamp: providersQuery.data?.timestamp || null
    }
  };
};

/**
 * Check if multiple addresses are providers
 * Uses batched queries for efficient provider checking
 */
export const useBatchProviderCheck = (addresses = [], options = {}) => {
  return useQueries({
    queries: addresses.map((address) => ({
      queryKey: providerQueryKeys.isLabProvider(address), // ✅ Use same query key as useIsLabProvider
      queryFn: () => useIsLabProvider.queryFn({ userAddress: address }), // ✅ Using atomic hook queryFn
      enabled: !!address && options.enabled !== false,
      ...USER_QUERY_CONFIG, // ✅ User-specific configuration
      // Note: options not spread here as USER_QUERY_CONFIG is optimized for user queries
    })),
    combine: (results) => ({
      data: results.reduce((acc, result, index) => {
        acc[addresses[index]] = result.data;
        return acc;
      }, {}),
      isLoading: results.some(result => result.isLoading),
      error: results.find(result => result.error)?.error || null,
      refetch: () => results.forEach(result => result.refetch())
    })
  });
};

/**
 * Get provider status and details for a specific address
 * Combines provider check and details fetching
 */
export const useProviderDetails = (address, options = {}) => {
  const statusQuery = useIsLabProvider({ 
    userAddress: address,
    enabled: !!address && options.enabled !== false
  });
  
  const detailsQuery = useLabProviders({
    enabled: statusQuery.data?.isProvider && options.enabled !== false
  });

  return {
    data: {
      isProvider: statusQuery.data?.isProvider || false,
      details: detailsQuery.data?.providers?.find(p => 
        p.account.toLowerCase() === address?.toLowerCase()
      ) || null
    },
    isLoading: statusQuery.isLoading || detailsQuery.isLoading,
    error: statusQuery.error || detailsQuery.error,
    refetch: () => {
      statusQuery.refetch();
      detailsQuery.refetch();
    }
  };
};

/**
 * Composed hook for getting all users (providers) with enriched data
 * Uses only the atomic hooks that exist in the current branch
 * @param {Object} options - Configuration options
 * @param {Object} options.queryOptions - Additional react-query options
 * @returns {Object} React Query result with provider data and status
 */
export const useAllUsersComposed = ({ queryOptions = {} } = {}) => {
  
  // Use atomic hook for base data
  const providersResult = useLabProviders(queryOptions);

  // Get providers from the atomic hook result
  const providers = providersResult.data?.providers || [];

  return {
    // Data
    data: {
      providers,
      totalProviders: providersResult.data?.count || providers.length
    },
    
    // Status
    isLoading: providersResult.isLoading,
    isSuccess: providersResult.isSuccess,
    isError: providersResult.isError,
    error: providersResult.error,
    
    // Meta information
    meta: {
      timestamp: providersResult.data?.timestamp,
      totalQueries: 1,
      successfulQueries: providersResult.isSuccess ? 1 : 0,
      failedQueries: providersResult.isError ? 1 : 0,
      errors: providersResult.error ? [providersResult.error] : []
    },

    // Utility functions
    refetch: providersResult.refetch,
    
    // React Query status
    isFetching: providersResult.isFetching,
    isPaused: providersResult.isPaused,
    isStale: providersResult.isStale,
  };
};

/**
 * Composed hook for getting complete provider status with enriched data
 * Uses atomic hooks that exist in the current branch
 * @param {string} providerAddress - Provider wallet address
 * @param {Object} options - Configuration options
 * @param {Object} options.queryOptions - Additional react-query options
 * @returns {Object} React Query result with complete provider information and status
 */
export const useProviderStatusComposed = (providerAddress, { queryOptions = {} } = {}) => {
  
  // Use atomic hook for isProvider check
  const isProviderResult = useIsLabProvider(providerAddress, {
    // Use atomic hook's default configuration, only allow specific overrides
    enabled: queryOptions.enabled !== undefined ? queryOptions.enabled : !!providerAddress,
    meta: queryOptions.meta,
  });
  
  // Get all providers to extract name and details
  const providersResult = useLabProviders({
    // Use atomic hook's default configuration, only allow specific overrides
    enabled: queryOptions.enabled !== undefined ? queryOptions.enabled : !!providerAddress,
    meta: queryOptions.meta,
  });

  // Extract provider details from the providers list
  const providerDetails = providersResult.data?.providers?.find(p =>
    p.account.toLowerCase() === providerAddress?.toLowerCase()
  ) || null;

  const isLoading = isProviderResult.isLoading || providersResult.isLoading;
  const errors = [isProviderResult.error, providersResult.error].filter(Boolean);
  const hasErrors = errors.length > 0;

  // Handle case where no address is provided
  if (!providerAddress) {
    return {
      data: {
        address: null,
        isProvider: false,
        name: null,
        details: null
      },
      isLoading: false,
      isSuccess: false,
      isError: true,
      error: new Error('Provider address is required'),
      meta: {
        providerAddress: null,
        totalQueries: 0,
        successfulQueries: 0,
        failedQueries: 1,
        errors: [new Error('Provider address is required')],
        timestamp: new Date().toISOString()
      }
    };
  }

  return {
    // Data
    data: {
      address: providerAddress,
      isProvider: isProviderResult?.data?.isProvider || isProviderResult?.data?.isLabProvider || false,
      name: providerDetails?.name || null,
      details: providerDetails
    },
    
    // Status
    isLoading,
    isSuccess: !hasErrors && (isProviderResult.isSuccess || providersResult.isSuccess),
    isError: hasErrors,
    error: errors[0] || null,
    
    // Meta information
    meta: {
      providerAddress,
      totalQueries: 2,
      successfulQueries: [isProviderResult, providersResult].filter(r => r.isSuccess).length,
      failedQueries: errors.length,
      hasPartialFailures: errors.length > 0 && errors.length < 2,
      errors,
      timestamp: new Date().toISOString()
    },

    // Individual result access for advanced use cases
    results: {
      isProvider: isProviderResult,
      providers: providersResult,
    },

    // Utility functions
    refetch: () => {
      isProviderResult.refetch();
      providersResult.refetch();
    },
    
    // React Query status aggregation
    isFetching: isProviderResult.isFetching || providersResult.isFetching,
    isPaused: isProviderResult.isPaused || providersResult.isPaused,
    isStale: isProviderResult.isStale || providersResult.isStale,
  };
};

/**
 * Lightweight composed hook for basic user list without extra enrichment
 * Alias for useAllUsersComposed for consistency
 * @param {Object} queryOptions - Additional react-query options
 * @returns {Object} React Query result with basic user data
 */
export const useAllUsersBasic = (queryOptions = {}) => {
  return useAllUsersComposed({ queryOptions });
};

/**
 * Full composed hook - same as basic since we only have one provider endpoint
 * Alias for useAllUsersComposed for consistency
 * @param {Object} queryOptions - Additional react-query options
 * @returns {Object} React Query result with user data
 */
export const useAllUsersFull = (queryOptions = {}) => {
  return useAllUsersComposed({ queryOptions });
};

/**
 * Cache extraction helper for finding a specific provider from the composed data
 * @param {Object} composedResult - Result from useAllUsersComposed
 * @param {string} providerAddress - Provider address to find
 * @returns {Object|null} Provider data if found, null otherwise
 */
export const extractProviderFromComposed = (composedResult, providerAddress) => {
  if (!composedResult?.data?.providers || !providerAddress) return null;
  
  return composedResult.data.providers.find(provider => 
    provider.account && provider.account.toLowerCase() === providerAddress.toLowerCase()
  ) || null;
};

/**
 * Cache extraction helper for checking if an address is a provider from composed data
 * @param {Object} composedResult - Result from useAllUsersComposed
 * @param {string} address - Address to check
 * @returns {boolean} True if address is a provider, false otherwise
 */
export const isProviderFromComposed = (composedResult, address) => {
  if (!composedResult?.data?.providers || !address) return false;
  
  return composedResult.data.providers.some(provider => 
    provider.account && provider.account.toLowerCase() === address.toLowerCase()
  );
};

/**
 * Cache extraction helper for getting provider name from composed data
 * @param {Object} composedResult - Result from useAllUsersComposed
 * @param {string} providerAddress - Provider address to get name for
 * @returns {string|null} Provider name if found and available, null otherwise
 */
export const getProviderNameFromComposed = (composedResult, providerAddress) => {
  if (!composedResult?.data?.providers || !providerAddress) return null;
  
  const provider = composedResult.data.providers.find(p => 
    p.account && p.account.toLowerCase() === providerAddress.toLowerCase()
  );
  
  return provider?.name || null;
};

// Module loaded confirmation (only logs once even in StrictMode)
devLog.moduleLoaded('✅ User composed hooks loaded');
