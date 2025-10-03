/**
 * Utility hook for provider mapping functionality
 * Provides reusable provider mapping logic across different hooks
 */
import { useGetLabProvidersQuery, USER_QUERY_CONFIG } from '@/hooks/user/useUsers'
import devLog from '@/utils/dev/logger'

/**
 * Custom hook for provider mapping with caching and error handling
 * @param {Object} options - Configuration options
 * @param {boolean} [options.enabled=true] - Whether to fetch providers
 * @param {Object} [options.queryOptions] - Additional query options
 * @returns {Object} Provider mapping utilities and data
 */
export const useProviderMapping = ({ 
  enabled = true, 
  queryOptions = {} 
} = {}) => {
  
  // Get providers data
  const providersResult = useGetLabProvidersQuery({
    ...USER_QUERY_CONFIG,
    enabled,
    ...queryOptions
  });

  /**
   * Map lab owner address to provider information
   * @param {string} ownerAddress - Lab owner wallet address
   * @returns {Object|null} Provider information or null if not found
   */
  const mapOwnerToProvider = (ownerAddress) => {
    if (!providersResult.data?.providers || !ownerAddress) {
      return null;
    }

    const matchingProvider = providersResult.data.providers.find(
      provider => provider.account?.toLowerCase() === ownerAddress.toLowerCase()
    );

    if (matchingProvider) {
      return {
        name: matchingProvider.name,
        email: matchingProvider.email,
        country: matchingProvider.country,
        account: matchingProvider.account
      };
    }

    return null;
  };

  /**
   * Get provider name from owner address
   * @param {string} ownerAddress - Lab owner wallet address
   * @returns {string} Provider name or 'Unknown Provider'
   */
  const getProviderName = (ownerAddress) => {
    const provider = mapOwnerToProvider(ownerAddress);
    return provider?.name || 'Unknown Provider';
  };

  /**
   * Bulk map multiple owners to providers
   * @param {string[]} ownerAddresses - Array of owner addresses
   * @returns {Object} Map of address to provider info
   */
  const mapMultipleOwners = (ownerAddresses) => {
    if (!Array.isArray(ownerAddresses)) return {};
    
    return ownerAddresses.reduce((acc, address) => {
      if (address) {
        acc[address] = mapOwnerToProvider(address);
      }
      return acc;
    }, {});
  };

  /**
   * Enhanced provider mapping with debug logging
   * @param {string} ownerAddress - Lab owner wallet address
   * @param {Object} options - Debug options
   * @param {boolean} [options.debug=false] - Enable debug logging
   * @returns {Object|null} Provider information with debug logs
   */
  const mapOwnerToProviderWithDebug = (ownerAddress, { debug = false } = {}) => {
    if (debug) {
      devLog.log('🔍 Provider mapping debug:', {
        providersCount: providersResult.data?.providers?.length || 0,
        ownerAddress,
        providers: providersResult.data?.providers?.map(p => ({ 
          account: p.account, 
          name: p.name 
        })) || []
      });
    }

    const result = mapOwnerToProvider(ownerAddress);

    if (debug) {
      devLog.log('🎯 Provider match result:', {
        matchingProvider: result,
        ownerAddress
      });
    }

    return result;
  };

  return {
    // Data
    providers: providersResult.data?.providers || [],
    providersCount: providersResult.data?.providers?.length || 0,
    
    // Status
    isLoading: providersResult.isLoading,
    isError: providersResult.isError,
    error: providersResult.error,
    
    // Mapping functions
    mapOwnerToProvider,
    getProviderName,
    mapMultipleOwners,
    mapOwnerToProviderWithDebug,
    
    // Raw result for advanced usage
    providersResult
  };
};

/**
 * Utility function for summary calculation
 * Centralized booking summary logic to avoid duplication
 * @param {Array} bookings - Array of booking objects
 * @param {Object} options - Calculation options
 * @param {boolean} [options.includeUpcoming=true] - Include upcoming count
 * @param {boolean} [options.includeCancelled=true] - Include cancelled count
 * @returns {Object} Summary aggregates
 */
export default useProviderMapping;
