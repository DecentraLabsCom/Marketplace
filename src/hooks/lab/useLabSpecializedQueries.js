/**
 * Specialized Lab Hooks - Optimized for specific use cases
 * These hooks use API-based queryFns with useQueries for composition.
 * This matches the composed/specialized pattern used in booking hooks.
 */
import { useMemo } from 'react'
import { 
  useAllLabsSSO,
  useLab,
  useLabSSO,
  useLabOwner,
  useLabOwnerSSO,
  useIsTokenListed,
  useIsTokenListedSSO,
  useLabReputation,
  useLabReputationSSO,
  LAB_QUERY_CONFIG 
} from './useLabAtomicQueries'
import { useProviderMapping } from '@/utils/hooks/useProviderMapping'
import { useMetadata, METADATA_QUERY_CONFIG } from '@/hooks/metadata/useMetadata'
import { useLabImageQuery } from '@/hooks/metadata/useLabImage'
import { processMetadataImages } from '@/hooks/utils/metadataHelpers'
import { buildEnrichedLab, collectMetadataImages } from './labEnrichmentHelpers'
import { useQueries } from '@tanstack/react-query'
import { labQueryKeys, metadataQueryKeys, labImageQueryKeys } from '@/utils/hooks/queryKeys'
import { useOptimisticUI } from '@/context/OptimisticUIContext'
import devLog from '@/utils/dev/logger'

const EMPTY_ARRAY = [];


/**
 * Specialized hook for Market component
 * Gets all labs with provider mapping but minimal data transformation
 * Optimized for filtering and display in lab grid
 * @param {Object} options - Configuration options
 * @param {boolean} [options.includeUnlisted=false] - Whether to include unlisted labs in results
 * @param {boolean} [options.enabled=true] - Whether the query should be enabled
 * @returns {Object} Lab data optimized for market display (includes isListed property when includeUnlisted=true)
 */
/**
 * ⚠️ ARCHITECTURAL NOTE: This specialized hook uses useQueries with SSO .queryFn
 * API endpoints are read-only blockchain queries that work for both SSO and Wallet users
 * This is the correct pattern for composed/specialized hooks per project architecture
 */
export const useLabsForMarket = (options = {}) => {
  // Extract includeUnlisted option
  const { includeUnlisted = false, ...queryOptions } = options;
  
  // Get optimistic UI context for listing states
  const { getEffectiveListingState } = useOptimisticUI();
  
  // Step 1: Get all lab IDs - Use SSO variant directly per architecture
  const labIdsResult = useAllLabsSSO({
    ...LAB_QUERY_CONFIG,
    enabled: queryOptions.enabled !== false,
    
    // ✅ Convert BigInt IDs to numbers in select to prevent serialization errors
    select: (data) => {
      if (!data || !Array.isArray(data)) return [];
      return data.map(id => typeof id === 'bigint' ? Number(id) : Number(id));
    }
  });

  const labIds = labIdsResult.data || EMPTY_ARRAY;

  // Step 2: Provider mapping
  const providerMapping = useProviderMapping({
    enabled: labIds.length > 0
  });

  // Step 3: Get lab details for all labs
  const labDetailResults = useQueries({
    queries: labIds.length > 0 
      ? labIds.map(labId => ({
          queryKey: labQueryKeys.getLab(labId),
          queryFn: () => useLabSSO.queryFn(labId),
          enabled: !!labId,
          ...LAB_QUERY_CONFIG,
        }))
      : [],
    combine: (results) => results
  });

  // Step 4: Get owner data for provider matching
  const ownerResults = useQueries({
    queries: labIds.length > 0
      ? labIds.map(labId => ({
          queryKey: labQueryKeys.ownerOf(labId),
          queryFn: () => useLabOwnerSSO.queryFn(labId),
          enabled: !!labId,
          ...LAB_QUERY_CONFIG,
        }))
      : [],
    combine: (results) => results
  });

  // Step 5: Check listing status for all labs
  const listingResults = useQueries({
    queries: labIds.length > 0
      ? labIds.map(labId => ({
          queryKey: labQueryKeys.isTokenListed(labId),
          queryFn: () => useIsTokenListedSSO.queryFn(labId),
          enabled: !!labId && (queryOptions.enabled !== false),
          ...LAB_QUERY_CONFIG,
        }))
      : [],
    combine: (results) => results
  });

  // Step 5.5: Get reputation data for all labs
  const reputationResults = useQueries({
    queries: labIds.length > 0
      ? labIds.map(labId => ({
          queryKey: labQueryKeys.getLabReputation(labId),
          queryFn: () => useLabReputationSSO.queryFn(labId),
          enabled: !!labId,
          ...LAB_QUERY_CONFIG,
        }))
      : [],
    combine: (results) => results
  });

  // Step 6: Get metadata for labs (conditional based on includeUnlisted option)
  const metadataResults = useQueries({
    queries: labDetailResults.length > 0
      ? labDetailResults.map((result, index) => {
          const lab = result.data;
          const metadataUri = lab?.base?.uri;
          const serverIsListed = listingResults[index]?.data?.isListed;
          
          // Use effective listing state for metadata fetching
          const effectiveState = getEffectiveListingState(lab?.labId, serverIsListed);
          
          // Determine if we should fetch metadata based on listing state and options
          const shouldFetchMetadata = includeUnlisted 
            ? !!metadataUri && result.isSuccess  // Fetch for all labs if includeUnlisted is true
            : effectiveState.isListed && !!metadataUri; // Only for listed labs with valid URI
          
          return {
            queryKey: metadataQueryKeys.byUri(metadataUri || 'placeholder'),
            queryFn: () => useMetadata.queryFn(metadataUri),
            enabled: shouldFetchMetadata,
            ...METADATA_QUERY_CONFIG,
          };
        })
      : [],
    combine: (results) => results
  });

  // Step 7: Extract and cache images from metadata
  const { labImageMap, uniqueImageUrls } = useMemo(() => {
    if (metadataResults.length === 0) {
      return { labImageMap: new Map(), uniqueImageUrls: EMPTY_ARRAY };
    }

    const imageUrlsToCache = [];
    const nextLabImageMap = new Map(); // Map lab index to image URLs

    metadataResults.forEach((metadataResult, index) => {
      if (metadataResult.isSuccess && metadataResult.data) {
        const metadata = metadataResult.data;
        const uniqueLabImages = collectMetadataImages(metadata);
        nextLabImageMap.set(index, uniqueLabImages);
        imageUrlsToCache.push(...uniqueLabImages);
      }
    });

    // Remove duplicate URLs across all labs
    const uniqueImageUrls = [...new Set(imageUrlsToCache)];

    return { labImageMap: nextLabImageMap, uniqueImageUrls };
  }, [metadataResults]);

  // Step 8: Create image cache queries
  const imageResults = useQueries({
    queries: uniqueImageUrls.length > 0
      ? uniqueImageUrls.map(imageUrl => ({
          queryKey: labImageQueryKeys.byUrl(imageUrl),
          queryFn: () => useLabImageQuery.queryFn(imageUrl),
          enabled: !!imageUrl,
          staleTime: 48 * 60 * 60 * 1000,    // 48 hours for images
          gcTime: 7 * 24 * 60 * 60 * 1000,   // 7 days
          refetchOnWindowFocus: false,
          retry: 2,
        }))
      : [],
    combine: (results) => results
  });

  // Processing and transformation
  const isLoading = labIdsResult.isLoading || 
                   labDetailResults.some(r => r.isLoading) ||
                   ownerResults.some(r => r.isLoading) ||
                   listingResults.some(r => r.isLoading) ||
                   metadataResults.some(r => r.isLoading) ||
                   imageResults.some(r => r.isLoading) ||
                   providerMapping.isLoading;

  const hasErrors = labIdsResult.error || 
                   labDetailResults.some(r => r.error) ||
                   ownerResults.some(r => r.error);

  // Transform data for market display - Include unlisted labs if requested
  const labs = useMemo(() => {
    if (labDetailResults.length === 0) {
      return EMPTY_ARRAY;
    }

    return labDetailResults
      .filter((result, index) => {
        if (!result.isSuccess || !result.data) return false;

        if (includeUnlisted) {
          // Include all labs when includeUnlisted is true
          return true;
        }

        const labId = result.data.labId;
        const serverIsListed = listingResults[index]?.data?.isListed;

        // Use effective listing state (optimistic overrides server state)
        const effectiveState = getEffectiveListingState(labId, serverIsListed);

        return effectiveState.isListed;
      })
      .map((labResult) => {
        const lab = labResult.data;

        // Find the correct indices for results arrays since we filtered some labs
        const originalIndex = labDetailResults.findIndex(r => r === labResult);
        const ownerData = ownerResults[originalIndex]?.data;
        const ownerAddress = ownerData?.owner || ownerData;
        const metadata = metadataResults[originalIndex]?.data;
        const reputation = reputationResults[originalIndex]?.data;

        // Get listing status for this lab
        const serverIsListed = listingResults[originalIndex]?.data?.isListed;
        const effectiveState = getEffectiveListingState(lab.labId, serverIsListed);
        const labImages = labImageMap.get(originalIndex) || EMPTY_ARRAY;

        return buildEnrichedLab({
          lab,
          metadata,
          isListed: effectiveState.isListed,
          reputation,
          ownerAddress,
          providerMapping,
          imageUrls: labImages,
          includeProviderInfo: true,
          includeProviderFallback: true,
          providerInfoSelector: (providerInfo) => ({
            name: providerInfo.name,
            email: providerInfo.email,
            country: providerInfo.country,
            account: providerInfo.account
          })
        });
      });
  }, [
    includeUnlisted,
    labDetailResults,
    listingResults,
    metadataResults,
    ownerResults,
    reputationResults,
    getEffectiveListingState,
    labImageMap,
    providerMapping
  ]);

  return {
    data: { labs, totalLabs: labs.length },
    isLoading,
    isSuccess: !hasErrors && labs.length > 0,
    isError: hasErrors,
    error: labIdsResult.error || labDetailResults.find(r => r.error)?.error || null,
    refetch: () => {
      labIdsResult.refetch();
      labDetailResults.forEach(r => r.refetch && r.refetch());
      ownerResults.forEach(r => r.refetch && r.refetch());
      metadataResults.forEach(r => r.refetch && r.refetch());
      reputationResults.forEach(r => r.refetch && r.refetch());
      imageResults.forEach(r => r.refetch && r.refetch());
      providerMapping.refetch();
    }
  };
};

/**
 * Specialized hook for getting a single lab by ID
 * Optimized for LabDetail and LabReservation components
 * @param {string|number} labId - Lab ID to fetch
 * @param {Object} options - Configuration options
 * @returns {Object} Single lab data with full details
 */
export const useLabById = (labId, options = {}) => {
  const normalizedLabId = labId ? String(labId) : null;

  // Get lab details
  const labResult = useLab(normalizedLabId, {
    ...LAB_QUERY_CONFIG,
    enabled: !!normalizedLabId && (options.enabled !== false),
  });

  // Get owner data
  const ownerResult = useLabOwner(normalizedLabId, {
    ...LAB_QUERY_CONFIG,
    enabled: !!normalizedLabId && (options.enabled !== false),
  });

  // Check if lab is listed
  const listingResult = useIsTokenListed(normalizedLabId, {
    ...LAB_QUERY_CONFIG,
    enabled: !!normalizedLabId && (options.enabled !== false),
  });

  // Get lab reputation
  const reputationResult = useLabReputation(normalizedLabId, {
    ...LAB_QUERY_CONFIG,
    enabled: !!normalizedLabId && (options.enabled !== false),
  });

  // Get metadata
  const metadataUri = labResult.data?.base?.uri;
  const metadataResult = useMetadata(metadataUri, {
    ...METADATA_QUERY_CONFIG,
    enabled: !!metadataUri && labResult.isSuccess,
  });

  // Provider mapping
  const providerMapping = useProviderMapping({
    enabled: !!ownerResult.data
  });

  // Extract image URLs from metadata for caching
  const metadata = metadataResult.data;
  const imageUrlsToCache = useMemo(() => collectMetadataImages(metadata), [metadata]);

  // Cache images
  const imageResults = useQueries({
    queries: imageUrlsToCache.length > 0
      ? imageUrlsToCache.map(imageUrl => ({
          queryKey: labImageQueryKeys.byUrl(imageUrl),
          queryFn: () => useLabImageQuery.queryFn(imageUrl),
          enabled: !!imageUrl,
          staleTime: 48 * 60 * 60 * 1000,    // 48 hours for images
          gcTime: 7 * 24 * 60 * 60 * 1000,   // 7 days
          refetchOnWindowFocus: false,
          retry: 2,
        }))
      : [],
    combine: (results) => results
  });

  const isLoading = labResult.isLoading || ownerResult.isLoading || listingResult.isLoading || metadataResult.isLoading || imageResults.some(r => r.isLoading);
  
  // Only critical errors (lab, owner, listing) should fail the entire query
  // Metadata errors should be gracefully handled with fallbacks
  const hasCriticalErrors = labResult.error || ownerResult.error || listingResult.error;
  const hasMetadataError = metadataResult.error;

  // Check if lab is listed
  const isListed = listingResult.data?.isListed;

  // Transform data - Always return lab if it exists, include listing status
  const lab = useMemo(() => {
    if (!labResult.data) {
      return null;
    }

    const ownerData = ownerResult.data;
    const ownerAddress = ownerData?.owner || ownerData;
    return buildEnrichedLab({
      lab: labResult.data,
      metadata,
      isListed,
      reputation: reputationResult.data,
      ownerAddress,
      providerMapping,
      imageUrls: imageUrlsToCache,
      includeProviderInfo: true,
      includeProviderFallback: true
    });
  }, [
    imageUrlsToCache,
    isListed,
    labResult.data,
    metadata,
    ownerResult.data,
    providerMapping,
    reputationResult.data
  ]);

  devLog.log('🔍 useLabById - Result:', {
    labId: normalizedLabId,
    found: !!lab,
    labName: lab?.name,
    provider: lab?.provider,
    hasMetadataError
  });

  return {
    data: lab,
    isLoading,
    isSuccess: !hasCriticalErrors && !!lab,
    isError: hasCriticalErrors,
    error: labResult.error || ownerResult.error || listingResult.error,
    metadataError: hasMetadataError ? metadataResult.error : null, // Separate metadata errors
    refetch: () => {
      labResult.refetch();
      ownerResult.refetch();
      listingResult.refetch();
      metadataResult.refetch();
      reputationResult.refetch();
      imageResults.forEach(r => r.refetch && r.refetch());
    }
  };
};

/**
 * Specialized hook for Provider Dashboard
 * Gets only labs owned by a specific address with owner data
 * @param {string} ownerAddress - Owner address to filter by
 * @param {Object} options - Configuration options
 * @returns {Object} Labs owned by the address
 * 
 * ⚠️ ARCHITECTURAL NOTE: Uses useQueries with SSO .queryFn
 * API endpoints work for both SSO and Wallet users - correct pattern for composed hooks
 */
export const useLabsForProvider = (ownerAddress, options = {}) => {
  // Get all lab IDs first - Use SSO variant directly per architecture
  const labIdsResult = useAllLabsSSO({
    ...LAB_QUERY_CONFIG,
    enabled: !!ownerAddress && (options.enabled !== false),
    // Convert BigInt IDs to numbers in select to prevent serialization errors
    select: (data) => {
      if (!data || !Array.isArray(data)) return [];
      return data.map(id => typeof id === 'bigint' ? Number(id) : Number(id));
    }
  });

  const labIds = labIdsResult.data || EMPTY_ARRAY;

  // Get all owner data to filter
  const ownerResults = useQueries({
    queries: labIds.length > 0
      ? labIds.map(labId => ({
          queryKey: labQueryKeys.ownerOf(labId),
          queryFn: () => useLabOwnerSSO.queryFn(labId),
          enabled: !!labId,
          ...LAB_QUERY_CONFIG,
        }))
      : [],
    combine: (results) => results
  });

  // Filter lab IDs by ownership and get details only for owned labs
  const ownedLabIds = useMemo(() => {
    if (!ownerAddress) return EMPTY_ARRAY;

    return labIds.filter((labId, index) => {
      const ownerData = ownerResults[index]?.data;
      const labOwner = ownerData?.owner || ownerData;
      return labOwner && labOwner.toLowerCase() === ownerAddress.toLowerCase();
    });
  }, [labIds, ownerAddress, ownerResults]);

  // Get lab details only for owned labs
  const labDetailResults = useQueries({
    queries: ownedLabIds.length > 0 
      ? ownedLabIds.map(labId => ({
          queryKey: labQueryKeys.getLab(labId),
          queryFn: () => useLabSSO.queryFn(labId),
          enabled: !!labId,
          ...LAB_QUERY_CONFIG,
        }))
      : [],
    combine: (results) => results
  });

  // Get listing status for owned labs
  const listingResults = useQueries({
    queries: ownedLabIds.length > 0
      ? ownedLabIds.map(labId => ({
          queryKey: labQueryKeys.isTokenListed(labId),
          queryFn: () => useIsTokenListedSSO.queryFn(labId),
          enabled: !!labId,
          ...LAB_QUERY_CONFIG,
        }))
      : [],
    combine: (results) => results
  });

  // Get metadata for owned labs
  const metadataResults = useQueries({
    queries: labDetailResults.length > 0
      ? labDetailResults.map((result) => {
          const lab = result.data;
          const metadataUri = lab?.base?.uri;
          return {
            queryKey: metadataQueryKeys.byUri(metadataUri || 'placeholder'),
            queryFn: () => useMetadata.queryFn(metadataUri),
            enabled: !!metadataUri && result.isSuccess,
            ...METADATA_QUERY_CONFIG,
          };
        })
      : [],
    combine: (results) => results
  });

  // Extract and cache images from metadata
  const { labImageMap, uniqueImageUrls } = useMemo(() => {
    if (metadataResults.length === 0) {
      return { labImageMap: new Map(), uniqueImageUrls: EMPTY_ARRAY };
    }

    const imageUrlsToCache = [];
    const nextLabImageMap = new Map(); // Map lab index to image URLs

    metadataResults.forEach((metadataResult, index) => {
      if (metadataResult.isSuccess && metadataResult.data) {
        const metadata = metadataResult.data;
        const uniqueLabImages = collectMetadataImages(metadata);
        nextLabImageMap.set(index, uniqueLabImages);
        imageUrlsToCache.push(...uniqueLabImages);
      }
    });

    // Remove duplicate URLs across all labs
    const uniqueImageUrls = [...new Set(imageUrlsToCache)];

    return { labImageMap: nextLabImageMap, uniqueImageUrls };
  }, [metadataResults]);

  // Create image cache queries
  const imageResults = useQueries({
    queries: uniqueImageUrls.length > 0
      ? uniqueImageUrls.map(imageUrl => ({
          queryKey: labImageQueryKeys.byUrl(imageUrl),
          queryFn: () => useLabImageQuery.queryFn(imageUrl),
          enabled: !!imageUrl,
          staleTime: 48 * 60 * 60 * 1000,    // 48 hours for images
          gcTime: 7 * 24 * 60 * 60 * 1000,   // 7 days
          refetchOnWindowFocus: false,
          retry: 2,
        }))
      : [],
    combine: (results) => results
  });

  const isLoading = labIdsResult.isLoading || 
                   ownerResults.some(r => r.isLoading) ||
                   labDetailResults.some(r => r.isLoading) ||
                   listingResults.some(r => r.isLoading) ||
                   metadataResults.some(r => r.isLoading) ||
                   imageResults.some(r => r.isLoading);

  const hasErrors = labIdsResult.error || 
                   labDetailResults.some(r => r.error);

  // Transform data
  const ownedLabs = useMemo(() => {
    if (labDetailResults.length === 0) {
      return EMPTY_ARRAY;
    }

    return labDetailResults
      .filter(result => result.isSuccess && result.data)
      .map((labResult, index) => {
        const lab = labResult.data;
        const metadata = metadataResults[index]?.data;
        const listingData = listingResults[index]?.data;
        const labImages = labImageMap.get(index) || EMPTY_ARRAY;

        return buildEnrichedLab({
          lab,
          metadata,
          isListed: listingData?.isListed || false,
          ownerAddress,
          imageUrls: labImages,
          includeOwner: true,
          includeProviderInfo: false,
          includeProviderFallback: false,
          useMetadataProvider: true
        });
      });
  }, [
    labDetailResults,
    labImageMap,
    listingResults,
    metadataResults,
    ownerAddress
  ]);

  devLog.log('👨‍🔬 useLabsForProvider - Result:', {
    ownerAddress,
    totalLabsChecked: labIds.length,
    ownedLabsCount: ownedLabs.length,
    ownedLabIds: ownedLabs.map(lab => lab.id)
  });

  return {
    data: { labs: ownedLabs, totalLabs: ownedLabs.length },
    isLoading,
    isSuccess: !hasErrors,
    isError: hasErrors,
    error: labIdsResult.error || labDetailResults.find(r => r.error)?.error || null,
    refetch: () => {
      labIdsResult.refetch();
      ownerResults.forEach(r => r.refetch && r.refetch());
      labDetailResults.forEach(r => r.refetch && r.refetch());
      listingResults.forEach(r => r.refetch && r.refetch());
      metadataResults.forEach(r => r.refetch && r.refetch());
      imageResults.forEach(r => r.refetch && r.refetch());
    }
  };
};

/**
 * Specialized hook for Lab Reservation component
 * Gets all labs with essential data for dropdown selection and lab details display
 * Includes metadata for names, descriptions, and images but excludes owners/providers for performance
 * @param {Object} options - Configuration options
 * @returns {Object} Labs with complete data needed for reservation functionality
 * 
 * ⚠️ ARCHITECTURAL NOTE: Uses SSO variant directly per architecture
 * API endpoints are read-only blockchain queries that work for both SSO and Wallet users
 */
export const useLabsForReservation = (options = {}) => {
  // Step 1: Get all lab IDs - Use SSO variant directly per architecture
  const labIdsResult = useAllLabsSSO({
    ...LAB_QUERY_CONFIG,
    enabled: options.enabled !== false,
    // Convert BigInt IDs to numbers in select to prevent serialization errors
    select: (data) => {
      if (!data || !Array.isArray(data)) return [];
      return data.map(id => typeof id === 'bigint' ? Number(id) : Number(id));
    }
  });

  const labIds = labIdsResult.data || EMPTY_ARRAY;

  // Step 2: Get lab details for each ID
  const labDetailResults = useQueries({
    queries: labIds.length > 0 
      ? labIds.map(labId => ({
          queryKey: labQueryKeys.getLab(labId),
          queryFn: () => useLabSSO.queryFn(labId),
          enabled: !!labId,
          ...LAB_QUERY_CONFIG,
        }))
      : [],
    combine: (results) => results
  });

  // Step 3: Check listing status for all labs
  const listingResults = useQueries({
    queries: labIds.length > 0
      ? labIds.map(labId => ({
          queryKey: labQueryKeys.isTokenListed(labId),
          queryFn: () => useIsTokenListedSSO.queryFn(labId),
          enabled: !!labId,
          ...LAB_QUERY_CONFIG,
        }))
      : [],
    combine: (results) => results
  });

  // Get lab data with IDs - only for listed labs
  const labsWithDetails = useMemo(() => {
    if (labDetailResults.length === 0) {
      return EMPTY_ARRAY;
    }

    return labDetailResults
      .filter((result, index) => {
        const isListed = listingResults[index]?.data?.isListed;
        return result.isSuccess && result.data && isListed;
      })
      .map(result => result.data);
  }, [labDetailResults, listingResults]);

  // Step 4: Get metadata for each listed lab to get names, descriptions, and images
  const metadataResults = useQueries({
    queries: labsWithDetails.length > 0 
      ? labsWithDetails.map(lab => {
          const metadataUri = lab?.base?.uri;
          return {
            queryKey: metadataQueryKeys.byUri(metadataUri || 'placeholder'),
            queryFn: () => useMetadata.queryFn(metadataUri),
            enabled: !!metadataUri,
            ...METADATA_QUERY_CONFIG,
          };
        })
      : [],
    combine: (results) => results
  });

  // Process and combine results
  const isLoading = labIdsResult.isLoading || 
                   labDetailResults.some(r => r.isLoading) ||
                   listingResults.some(r => r.isLoading) ||
                   metadataResults.some(r => r.isLoading);
  
  const hasErrors = labIdsResult.error || labDetailResults.some(r => r.error);

  // Enrich labs with metadata for complete reservation data
  const enrichedLabs = useMemo(() => {
    if (labsWithDetails.length === 0) {
      return EMPTY_ARRAY;
    }

    return labsWithDetails.map((lab, index) => {
      const metadataData = metadataResults[index]?.data;

      // Extract images from metadata
      const images = processMetadataImages(metadataData);

      return buildEnrichedLab({
        lab,
        metadata: metadataData,
        images,
        includeProviderInfo: false,
        includeProviderFallback: false,
        descriptionFallback: 'No description available',
        ensureNonEmptyTimeSlots: true
      });
    });
  }, [labsWithDetails, metadataResults]);

  devLog.log('🎯 useLabsForReservation - Complete result:', {
    totalLabs: enrichedLabs.length,
    sampleLabs: enrichedLabs.slice(0, 2).map(lab => ({ 
      id: lab.id, 
      name: lab.name,
      opens: lab.opens,
      closes: lab.closes,
      hasImages: lab.images?.length > 0,
      hasDescription: !!lab.description 
    }))
  });

  return {
    data: { labs: enrichedLabs, totalLabs: enrichedLabs.length },
    isLoading,
    isSuccess: !hasErrors && enrichedLabs.length > 0,
    isError: hasErrors,
    error: labIdsResult.error || labDetailResults.find(r => r.error)?.error || null,
    refetch: () => {
      labIdsResult.refetch();
      labDetailResults.forEach(r => r.refetch && r.refetch());
      listingResults.forEach(r => r.refetch && r.refetch());
      metadataResults.forEach(r => r.refetch && r.refetch());
    }
  };
};

// Module loaded confirmation
devLog.moduleLoaded('✅ Lab specialized hooks loaded');
