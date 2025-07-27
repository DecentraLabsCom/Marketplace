/**
 * React Query Hooks for Labs
 * Replaces gradually the logic of LabContext
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { labServices } from '@/services/labServices';
import { QUERY_KEYS } from '@/utils/queryKeys';
import devLog from '@/utils/dev/logger';

// === QUERIES ===

/**
 * Hook to get all labs
 */
export const useAllLabsQuery = (options = {}) => {
  return useQuery({
    queryKey: QUERY_KEYS.LABS.all,
    queryFn: () => labServices.fetchAllLabs(),
    staleTime: 12 * 60 * 60 * 1000, // 12 hours (labs are more stable)
    gcTime: 24 * 60 * 60 * 1000, // 24 hours
    retry: 2,
    ...options,
  });
};

/**
 * Hook to get details of a specific lab
 */
export const useLabDetailQuery = (labId, options = {}) => {
  return useQuery({
    queryKey: QUERY_KEYS.LABS.detail(labId),
    queryFn: () => labServices.fetchLabById(labId),
    enabled: !!labId,
    staleTime: 12 * 60 * 60 * 1000, // 12 hours
    gcTime: 24 * 60 * 60 * 1000, // 24 hours
    retry: 2,
    ...options,
  });
};

/**
 * Hook to get labs by a specific provider
 */
export const useLabsByProviderQuery = (providerId, options = {}) => {
  return useQuery({
    queryKey: QUERY_KEYS.LABS.byProvider(providerId),
    queryFn: () => labServices.fetchLabsByProvider(providerId),
    enabled: !!providerId,
    staleTime: 12 * 60 * 60 * 1000, // 12 hours
    gcTime: 24 * 60 * 60 * 1000, // 24 hours
    retry: 2,
    ...options,
  });
};

// === DERIVED QUERIES ===

/**
 * Hook to get available labs (filtered)
 */
export const useAvailableLabsQuery = (filters = {}, options = {}) => {
  const allLabsQuery = useAllLabsQuery(options);

  return {
    ...allLabsQuery,
    data: allLabsQuery.data ? filterLabs(allLabsQuery.data, filters) : undefined,
  };
};

/**
 * Hook to search labs by terms
 */
export const useSearchLabsQuery = (searchTerm, options = {}) => {
  const allLabsQuery = useAllLabsQuery(options);

  return {
    ...allLabsQuery,
    data: allLabsQuery.data ? searchLabs(allLabsQuery.data, searchTerm) : undefined,
  };
};

// === UTILITIES ===

/**
 * Filter labs by criteria
 */
const filterLabs = (labs, filters) => {
  if (!labs || !Array.isArray(labs)) return [];

  return labs.filter(lab => {
    // Filter by availability
    if (filters.available !== undefined && lab.available !== filters.available) {
      return false;
    }

    // Filter by category
    if (filters.category && lab.category !== filters.category) {
      return false;
    }

    // Filter by provider
    if (filters.providerId && lab.providerId !== filters.providerId) {
      return false;
    }

    // Filter by location
    if (filters.location && !lab.location.includes(filters.location)) {
      return false;
    }

    return true;
  });
};

/**
 * Search labs by term
 */
const searchLabs = (labs, searchTerm) => {
  if (!labs || !Array.isArray(labs) || !searchTerm) return labs;

  const term = searchTerm.toLowerCase();
  
  return labs.filter(lab => 
    lab.name?.toLowerCase().includes(term) ||
    lab.description?.toLowerCase().includes(term) ||
    lab.keywords?.some(keyword => keyword.toLowerCase().includes(term)) ||
    lab.category?.toLowerCase().includes(term)
  );
};

/**
 * Hook to invalidate lab cache manually
 */
export const useLabCacheInvalidation = () => {
  const queryClient = useQueryClient();
  
  return {
    invalidateAllLabs: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.LABS.all });
    },
    
    invalidateLabDetail: (labId) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.LABS.detail(labId) });
    },
    
    invalidateProviderLabs: (providerId) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.LABS.byProvider(providerId) });
    },
    
    // Force refetch without invalidation
    refetchAllLabs: () => {
      queryClient.refetchQueries({ queryKey: QUERY_KEYS.LABS.all });
    },
    
    refetchLabDetail: (labId) => {
      queryClient.refetchQueries({ queryKey: QUERY_KEYS.LABS.detail(labId) });
    },
  };
};

// === PREFETCH UTILITIES ===

/**
 * Hook to prefetch lab details when hovering
 */
export const useLabPrefetch = () => {
  const queryClient = useQueryClient();
  
  return {
    prefetchLabDetail: (labId) => {
      queryClient.prefetchQuery({
        queryKey: QUERY_KEYS.LABS.detail(labId),
        queryFn: () => labServices.fetchLabById(labId),
        staleTime: 12 * 60 * 60 * 1000,
      });
    },
    
    prefetchLabsByProvider: (providerId) => {
      queryClient.prefetchQuery({
        queryKey: QUERY_KEYS.LABS.byProvider(providerId),
        queryFn: () => labServices.fetchLabsByProvider(providerId),
        staleTime: 12 * 60 * 60 * 1000,
      });
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
    
    onMutate: async (labData) => {
      devLog.log('Creating lab optimistically...', labData);
      
      // Cancel outgoing queries to avoid overwriting optimistic update
      await queryClient.cancelQueries({ queryKey: QUERY_KEYS.LABS.all });
      
      // Snapshot previous value
      const previousLabs = queryClient.getQueryData(QUERY_KEYS.LABS.all);
      
      // Optimistically update labs list
      if (previousLabs) {
        const optimisticLab = {
          id: `temp_${Date.now()}`,
          ...labData,
          createdAt: new Date().toISOString(),
        };
        
        queryClient.setQueryData(
          QUERY_KEYS.LABS.all,
          [...previousLabs, optimisticLab]
        );
      }
      
      return { previousLabs };
    },
    
    onError: (err, variables, context) => {
      devLog.error('Error creating lab, rolling back:', err);
      
      // Rollback optimistic update
      if (context?.previousLabs) {
        queryClient.setQueryData(QUERY_KEYS.LABS.all, context.previousLabs);
      }
    },
    
    onSuccess: (data, variables) => {
      devLog.log('Lab created successfully:', data);
      
      // Invalidate and refetch related queries
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.LABS.all });
      
      if (variables.providerId) {
        queryClient.invalidateQueries({ 
          queryKey: QUERY_KEYS.LABS.byProvider(variables.providerId) 
        });
      }
    },
  });
};

/**
 * Hook to update an existing lab
 */
export const useUpdateLabMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ labId, labData }) => labServices.updateLab(labId, labData),
    
    onMutate: async ({ labId, labData }) => {
      devLog.log('Updating lab optimistically...', { labId, labData });
      
      // Cancel outgoing queries
      await queryClient.cancelQueries({ queryKey: QUERY_KEYS.LABS.all });
      await queryClient.cancelQueries({ queryKey: QUERY_KEYS.LABS.detail(labId) });
      
      // Snapshot previous values
      const previousLabs = queryClient.getQueryData(QUERY_KEYS.LABS.all);
      const previousLabDetail = queryClient.getQueryData(QUERY_KEYS.LABS.detail(labId));
      
      // Optimistically update labs list
      if (previousLabs) {
        queryClient.setQueryData(
          QUERY_KEYS.LABS.all,
          previousLabs.map(lab => lab.id === labId ? { ...lab, ...labData } : lab)
        );
      }
      
      // Optimistically update lab detail
      if (previousLabDetail) {
        queryClient.setQueryData(
          QUERY_KEYS.LABS.detail(labId),
          { ...previousLabDetail, ...labData }
        );
      }
      
      return { previousLabs, previousLabDetail };
    },
    
    onError: (err, variables, context) => {
      devLog.error('Error updating lab, rolling back:', err);
      
      // Rollback optimistic updates
      if (context?.previousLabs) {
        queryClient.setQueryData(QUERY_KEYS.LABS.all, context.previousLabs);
      }
      
      if (context?.previousLabDetail) {
        queryClient.setQueryData(
          QUERY_KEYS.LABS.detail(variables.labId),
          context.previousLabDetail
        );
      }
    },
    
    onSuccess: (data, variables) => {
      devLog.log('Lab updated successfully:', data);
      
      // Invalidate and refetch related queries
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.LABS.all });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.LABS.detail(variables.labId) });
      
      if (variables.labData.providerId) {
        queryClient.invalidateQueries({ 
          queryKey: QUERY_KEYS.LABS.byProvider(variables.labData.providerId) 
        });
      }
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
    
    onMutate: async (labId) => {
      devLog.log('Deleting lab optimistically...', labId);
      
      // Cancel outgoing queries
      await queryClient.cancelQueries({ queryKey: QUERY_KEYS.LABS.all });
      
      // Snapshot previous value
      const previousLabs = queryClient.getQueryData(QUERY_KEYS.LABS.all);
      
      // Optimistically remove lab
      if (previousLabs) {
        queryClient.setQueryData(
          QUERY_KEYS.LABS.all,
          previousLabs.filter(lab => lab.id !== labId)
        );
      }
      
      return { previousLabs };
    },
    
    onError: (err, variables, context) => {
      devLog.error('Error deleting lab, rolling back:', err);
      
      // Rollback optimistic update
      if (context?.previousLabs) {
        queryClient.setQueryData(QUERY_KEYS.LABS.all, context.previousLabs);
      }
    },
    
    onSuccess: (data, variables) => {
      devLog.log('Lab deleted successfully:', variables);
      
      // Invalidate and refetch related queries
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.LABS.all });
      
      // Remove specific lab detail from cache
      queryClient.removeQueries({ queryKey: QUERY_KEYS.LABS.detail(variables) });
    },
  });
};

/**
 * Hook to toggle lab status (list/unlist)
 */
export const useToggleLabStatusMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ labId, isListed }) => labServices.toggleLabStatus(labId, isListed),
    
    onMutate: async ({ labId, isListed }) => {
      devLog.log('Toggling lab status optimistically...', { labId, isListed });
      
      // Cancel outgoing queries
      await queryClient.cancelQueries({ queryKey: QUERY_KEYS.LABS.all });
      await queryClient.cancelQueries({ queryKey: QUERY_KEYS.LABS.detail(labId) });
      
      // Snapshot previous values
      const previousLabs = queryClient.getQueryData(QUERY_KEYS.LABS.all);
      const previousLabDetail = queryClient.getQueryData(QUERY_KEYS.LABS.detail(labId));
      
      // Optimistically update status
      if (previousLabs) {
        queryClient.setQueryData(
          QUERY_KEYS.LABS.all,
          previousLabs.map(lab => 
            lab.id === labId ? { ...lab, isListed } : lab
          )
        );
      }
      
      if (previousLabDetail) {
        queryClient.setQueryData(
          QUERY_KEYS.LABS.detail(labId),
          { ...previousLabDetail, isListed }
        );
      }
      
      return { previousLabs, previousLabDetail };
    },
    
    onError: (err, variables, context) => {
      devLog.error('Error toggling lab status, rolling back:', err);
      
      // Rollback optimistic updates
      if (context?.previousLabs) {
        queryClient.setQueryData(QUERY_KEYS.LABS.all, context.previousLabs);
      }
      
      if (context?.previousLabDetail) {
        queryClient.setQueryData(
          QUERY_KEYS.LABS.detail(variables.labId),
          context.previousLabDetail
        );
      }
    },
    
    onSuccess: (data, variables) => {
      devLog.log('Lab status toggled successfully:', data);
      
      // Invalidate and refetch related queries
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.LABS.all });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.LABS.detail(variables.labId) });
    },
  });
};