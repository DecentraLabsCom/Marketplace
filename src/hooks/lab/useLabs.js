/**
 * React Query Hooks for Labs - Atomic Composition Pattern
 * Uses atomic services with React Query composition for optimal caching
 */
import { useQuery, useQueries, useMutation, useQueryClient } from '@tanstack/react-query'
import { labServices } from '@/services/labServices'
import { QUERY_KEYS } from '@/utils/hooks/queryKeys'
import { composeLabObject, createProviderMap, createFallbackLab } from '@/utils/hooks/labHelpers'
import devLog from '@/utils/dev/logger'

// === ATOMIC QUERIES ===

/**
 * Hook to get basic lab list (atomic)
 * @param {Object} [options={}] - Additional react-query options
 * @returns {Object} React Query result with lab list data, loading state, and error handling
 */
export const useLabListQuery = (options = {}) => {
  return useQuery({
    queryKey: QUERY_KEYS.LABS.list,
    queryFn: () => labServices.fetchLabList(),
    staleTime: 12 * 60 * 60 * 1000, // 12 hours
    gcTime: 24 * 60 * 60 * 1000, // 24 hours
    retry: 2,
    ...options,
  });
};

/**
 * Hook to get LAB token decimals (atomic)
 * @param {Object} [options={}] - Additional react-query options
 * @returns {Object} React Query result with LAB token decimals data, loading state, and error handling
 */
export const useLabDecimalsQuery = (options = {}) => {
  return useQuery({
    queryKey: QUERY_KEYS.LABS.decimals,
    queryFn: () => labServices.fetchLabDecimals(),
    staleTime: 24 * 60 * 60 * 1000, // 24 hours (very stable)
    gcTime: 48 * 60 * 60 * 1000, // 48 hours
    retry: 2,
    ...options,
  });
};

/**
 * Hook to get specific lab data (atomic)
 * @param {string|number} labId - Lab identifier
 * @param {Object} [options={}] - Additional react-query options
 * @returns {Object} React Query result with lab data, loading state, and error handling
 */
export const useLabDataQuery = (labId, options = {}) => {
  return useQuery({
    queryKey: QUERY_KEYS.LABS.data(labId),
    queryFn: () => labServices.fetchLabData(labId),
    enabled: !!labId,
    staleTime: 12 * 60 * 60 * 1000, // 12 hours
    gcTime: 24 * 60 * 60 * 1000, // 24 hours
    retry: 2,
    ...options,
  });
};

/**
 * Hook to get lab owner (atomic)
 * @param {string|number} labId - Lab identifier
 * @param {Object} [options={}] - Additional react-query options
 * @returns {Object} React Query result with lab owner data, loading state, and error handling
 */
export const useLabOwnerQuery = (labId, options = {}) => {
  return useQuery({
    queryKey: QUERY_KEYS.LABS.owner(labId),
    queryFn: () => labServices.fetchLabOwner(labId),
    enabled: !!labId,
    staleTime: 6 * 60 * 60 * 1000, // 6 hours (can change)
    gcTime: 12 * 60 * 60 * 1000, // 12 hours
    retry: 2,
    ...options,
  });
};

/**
 * Hook to get providers list (atomic)
 * @param {Object} [options={}] - Additional react-query options
 * @returns {Object} React Query result with providers list data, loading state, and error handling
 */
export const useProvidersListQuery = (options = {}) => {
  return useQuery({
    queryKey: QUERY_KEYS.PROVIDERS.list,
    queryFn: () => labServices.fetchProvidersList(),
    staleTime: 12 * 60 * 60 * 1000, // 12 hours
    gcTime: 24 * 60 * 60 * 1000, // 24 hours
    retry: 2,
    ...options,
  });
};

/**
 * Hook to get lab metadata (atomic)
 * @param {string} metadataUri - URI to fetch metadata from
 * @param {string|number} labId - Lab identifier for context
 * @param {Object} [options={}] - Additional react-query options
 * @returns {Object} React Query result with lab metadata, loading state, and error handling
 */
export const useLabMetadataQuery = (metadataUri, labId, options = {}) => {
  return useQuery({
    queryKey: QUERY_KEYS.LABS.metadata(metadataUri),
    queryFn: () => labServices.fetchLabMetadata(metadataUri, labId),
    enabled: !!metadataUri,
    staleTime: 12 * 60 * 60 * 1000, // 12 hours
    gcTime: 24 * 60 * 60 * 1000, // 24 hours
    retry: 2,
    ...options,
  });
};

// === COMPOSED QUERIES ===

/**
 * Hook to get all labs with complete details (composed from atomic queries)
 * @param {Object} [options={}] - Additional react-query options to pass to underlying queries
 * @returns {Object} Combined result with composed lab data, loading states, and query status
 */
export const useAllLabsQuery = (options = {}) => {
  // Get basic data first
  const labListQuery = useLabListQuery();
  const decimalsQuery = useLabDecimalsQuery();
  const providersQuery = useProvidersListQuery();

  // Get detailed data for each lab
  const labQueries = useQueries({
    queries: labListQuery.data?.map(lab => ({
      queryKey: QUERY_KEYS.LABS.data(lab.labId),
      queryFn: () => labServices.fetchLabData(lab.labId.toString()),
      enabled: !!labListQuery.data,
      staleTime: 12 * 60 * 60 * 1000,
    })) || []
  });

  const ownerQueries = useQueries({
    queries: labListQuery.data?.map(lab => ({
      queryKey: QUERY_KEYS.LABS.owner(lab.labId),
      queryFn: () => labServices.fetchLabOwner(lab.labId.toString()),
      enabled: !!labListQuery.data,
      staleTime: 6 * 60 * 60 * 1000,
    })) || []
  });

  const metadataQueries = useQueries({
    queries: labQueries.map((labQuery, index) => ({
      queryKey: QUERY_KEYS.LABS.metadata(labQuery.data?.base?.uri || ''),
      queryFn: () => labServices.fetchLabMetadata(
        labQuery.data.base.uri, 
        labListQuery.data[index].labId.toString()
      ),
      enabled: !!labQuery.data?.base?.uri,
      staleTime: 12 * 60 * 60 * 1000,
    }))
  });

  // Compose results
  const isLoading = labListQuery.isLoading || decimalsQuery.isLoading || 
                   providersQuery.isLoading || labQueries.some(q => q.isLoading) ||
                   ownerQueries.some(q => q.isLoading) || metadataQueries.some(q => q.isLoading);

  const error = labListQuery.error || decimalsQuery.error || providersQuery.error;

  let composedLabs = [];
  if (labListQuery.data && decimalsQuery.data && providersQuery.data) {
    const providerMap = createProviderMap(providersQuery.data);
    
    composedLabs = labListQuery.data.map((lab, index) => {
      const labId = lab.labId.toString();
      const labData = labQueries[index]?.data;
      const owner = ownerQueries[index]?.data;
      const metadata = metadataQueries[index]?.data;

      if (labData && owner && metadata) {
        return composeLabObject(labId, labData, owner, metadata, decimalsQuery.data, providerMap);
      } else {
        // Return fallback for partial data
        return createFallbackLab(labId, lab.base?.uri || '');
      }
    });
  }

  return {
    data: composedLabs,
    isLoading,
    error,
    isSuccess: composedLabs.length > 0,
    // Individual query states for granular control
    queries: {
      labList: labListQuery,
      decimals: decimalsQuery,
      providers: providersQuery,
      labData: labQueries,
      owners: ownerQueries,
      metadata: metadataQueries
    },
    ...options
  };
};

// === CACHE MANAGEMENT ===

/**
 * Hook to manually invalidate lab cache and force refetch
 */
export const useLabCacheInvalidation = () => {
  const queryClient = useQueryClient();
  
  return {
    invalidateAllLabs: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.LABS.list });
      queryClient.invalidateQueries({ queryKey: ['labs'] }); // Invalidate all lab-related queries
    },
    
    invalidateLabDetail: (labId) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.LABS.data(labId) });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.LABS.owner(labId) });
    },
    
    invalidateProviders: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.PROVIDERS.list });
    },
    
    // Force refetch without invalidation
    refetchAllLabs: () => {
      queryClient.refetchQueries({ queryKey: QUERY_KEYS.LABS.list });
    },
    
    refetchLabDetail: (labId) => {
      queryClient.refetchQueries({ queryKey: QUERY_KEYS.LABS.data(labId) });
    },
  };
};

// === MUTATIONS ===

/**
 * Hook to create a new lab
 */
export const useCreateLabMutation = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (labData) => labServices.createLab(labData),
    onSuccess: () => {
      // Invalidate relevant queries after successful creation
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.LABS.list });
      queryClient.invalidateQueries({ queryKey: ['labs'] });
    },
    onError: (error) => {
      devLog.error('Failed to create lab:', error);
    },
  });
};

/**
 * Hook to update a lab
 */
export const useUpdateLabMutation = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ labId, labData }) => labServices.updateLab(labId, labData),
    onSuccess: (data, variables) => {
      // Invalidate specific lab and list
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.LABS.data(variables.labId) });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.LABS.list });
      queryClient.invalidateQueries({ queryKey: ['labs'] });
    },
    onError: (error) => {
      devLog.error('Failed to update lab:', error);
    },
  });
};

/**
 * Hook to delete a lab
 */
export const useDeleteLabMutation = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (labId) => labServices.deleteLab(labId),
    onSuccess: (data, labId) => {
      // Remove specific lab from cache and invalidate list
      queryClient.removeQueries({ queryKey: QUERY_KEYS.LABS.data(labId) });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.LABS.list });
      queryClient.invalidateQueries({ queryKey: ['labs'] });
    },
    onError: (error) => {
      devLog.error('Failed to delete lab:', error);
    },
  });
};

/**
 * Hook to toggle lab status (enable/disable)
 */
export const useToggleLabStatusMutation = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ labId, status }) => labServices.toggleLabStatus(labId, status),
    onSuccess: (data, variables) => {
      // Invalidate specific lab and list
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.LABS.data(variables.labId) });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.LABS.list });
      queryClient.invalidateQueries({ queryKey: ['labs'] });
    },
    onError: (error) => {
      devLog.error('Failed to toggle lab status:', error);
    },
  });
};
