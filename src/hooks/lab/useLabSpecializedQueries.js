/**
 * Specialized Lab Hooks - Optimized for specific use cases
 * These hooks use API-based queryFns with useQueries for composition.
 * This matches the composed/specialized pattern used in booking hooks.
 */
import { useEffect, useMemo } from 'react'
import { 
  useAllLabsSSO,
  useLab,
  useLabSSO,
  useLabOwner,
  useLabCreatorPucHashSSO,
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
import { useQueries, useQueryClient } from '@tanstack/react-query'
import { labQueryKeys, metadataQueryKeys, labImageQueryKeys } from '@/utils/hooks/queryKeys'
import { useOptimisticUI } from '@/context/OptimisticUIContext'
import devLog from '@/utils/dev/logger'

const EMPTY_ARRAY = [];

const normalizeLabIds = (ids) => {
  if (!Array.isArray(ids)) return [];

  const seen = new Set();
  const normalized = [];

  ids.forEach((entry) => {
    const rawId = typeof entry === 'object' && entry !== null
      ? (entry.labId ?? entry.id ?? entry.tokenId ?? null)
      : entry;
    const numericId = typeof rawId === 'bigint' ? Number(rawId) : Number(rawId);

    if (!Number.isFinite(numericId) || seen.has(numericId)) return;

    seen.add(numericId);
    normalized.push(numericId);
  });

  return normalized;
};

const extractStatusCodeFromError = (error) => {
  const message = String(error?.message || '');
  const directMatch = message.match(/:\s*(\d{3})(?:\D|$)/);
  if (directMatch) return Number(directMatch[1]);
  return null;
};

const collectDeletedLabIds = (labIds, labDetailResults, listingResults) => {
  const deleted = new Set();

  labIds.forEach((rawLabId, index) => {
    const labId = Number(rawLabId);
    if (!Number.isFinite(labId)) return;

    const labResult = labDetailResults[index];
    const listingResult = listingResults[index];

    if (labResult?.isSuccess && (labResult.data === null || labResult.data === undefined)) {
      deleted.add(labId);
      return;
    }

    if (extractStatusCodeFromError(labResult?.error) === 404) {
      deleted.add(labId);
      return;
    }

    if (listingResult?.isSuccess && listingResult?.data?.notFound) {
      deleted.add(labId);
      return;
    }

    if (extractStatusCodeFromError(listingResult?.error) === 404) {
      deleted.add(labId);
    }
  });

  return Array.from(deleted);
};

const usePruneDeletedLabIds = (labIds, labDetailResults, listingResults) => {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!Array.isArray(labIds) || labIds.length === 0) return;

    const deletedIds = collectDeletedLabIds(labIds, labDetailResults, listingResults);
    if (deletedIds.length === 0) return;

    const deletedSet = new Set(deletedIds.map((id) => Number(id)));

    queryClient.setQueryData(labQueryKeys.getAllLabs(), (oldData) => {
      if (!Array.isArray(oldData)) return oldData;
      return oldData.filter((id) => !deletedSet.has(Number(id)));
    });

    deletedIds.forEach((labId) => {
      const derivedKeys = labQueryKeys.derivedByLabId ? labQueryKeys.derivedByLabId(labId) : [];
      derivedKeys.forEach((qk) => {
        queryClient.removeQueries({ queryKey: qk, exact: true });
      });
    });

    devLog.warn('🧹 Pruned deleted lab IDs from local cache', { deletedIds });
  }, [queryClient, labIds, labDetailResults, listingResults]);
};


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
 * API endpoints are read-only blockchain queries used by the institutional runtime
 * This is the correct pattern for composed/specialized hooks per project architecture
 */
export const useLabsForMarket = (options = {}) => {
  // Extract includeUnlisted option
  const {
    includeUnlisted = false,
    prefetchImages = false,
    ...queryOptions
  } = options;
  
  // Get optimistic UI context for listing states
  const { getEffectiveListingState } = useOptimisticUI();
  
  // Step 1: Get all lab IDs - Use SSO variant directly per architecture
  const labIdsResult = useAllLabsSSO({
    ...LAB_QUERY_CONFIG,
    enabled: queryOptions.enabled !== false,
    
    // ✅ Convert BigInt IDs to numbers in select to prevent serialization errors
    select: normalizeLabIds
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

  usePruneDeletedLabIds(labIds, labDetailResults, listingResults);

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
    queries: prefetchImages && uniqueImageUrls.length > 0
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

  const hasCriticalError = Boolean(labIdsResult.error);
  const hasRecoverableErrors =
    labDetailResults.some(r => r.error);

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
        const listingResult = listingResults[index];
        const serverIsListed = listingResult?.data?.isListed;

        // If listing status is temporarily unavailable, do not hide valid labs.
        if (listingResult?.error) {
          return true;
        }

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
        const listingResult = listingResults[originalIndex];
        const serverIsListed = listingResult?.data?.isListed;
        const effectiveState = listingResult?.error
          ? { isListed: true, isPending: false, operation: null }
          : getEffectiveListingState(lab.labId, serverIsListed);
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

  const shouldReportError =
    hasCriticalError || (labs.length === 0 && hasRecoverableErrors);
  const firstRecoverableError =
    labDetailResults.find(r => r.error)?.error ||
    null;

  return {
    data: { labs, totalLabs: labs.length },
    isLoading,
    isSuccess: !shouldReportError,
    isError: shouldReportError,
    error: hasCriticalError ? labIdsResult.error : (shouldReportError ? firstRecoverableError : null),
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
  const { getEffectiveListingState } = useOptimisticUI();

  // Get lab details
  const labResult = useLab(normalizedLabId, {
    ...LAB_QUERY_CONFIG,
    enabled: !!normalizedLabId && (options.enabled !== false),
    // Detail pages must revalidate on mount because query persistence can keep
    // stale placeholder/null lab data around across reloads.
    refetchOnMount: 'always',
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
    // Listing state is user-visible and can be toggled from other surfaces.
    // Force a fresh read on mount instead of trusting persisted cache.
    refetchOnMount: 'always',
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
  const serverIsListed = listingResult.data?.isListed;
  const effectiveListingState = listingResult.error
    ? { isListed: true, isPending: false, operation: null }
    : getEffectiveListingState(normalizedLabId, serverIsListed);

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
  
  // Only critical errors (lab, owner) should fail the entire query.
  // Listing errors are treated as recoverable to avoid false "Not Available" states.
  // Metadata errors should be gracefully handled with fallbacks
  const hasCriticalErrors = labResult.error || ownerResult.error;
  const hasMetadataError = metadataResult.error;

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
      isListed: effectiveListingState.isListed,
      reputation: reputationResult.data,
      ownerAddress,
      providerMapping,
      imageUrls: imageUrlsToCache,
      includeProviderInfo: true,
      includeProviderFallback: true
    });
  }, [
    effectiveListingState.isListed,
    imageUrlsToCache,
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
    error: labResult.error || ownerResult.error,
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
 * API endpoints are safe for composed hooks in the institutional runtime
 */
export const useLabsForProvider = (ownerAddress, options = {}) => {
  // Get all lab IDs first - Use SSO variant directly per architecture
  const labIdsResult = useAllLabsSSO({
    ...LAB_QUERY_CONFIG,
    enabled: !!ownerAddress && (options.enabled !== false),
    // Convert BigInt IDs to numbers in select to prevent serialization errors
    select: normalizeLabIds
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
  const ownerMatchedLabIds = useMemo(() => {
    if (!ownerAddress) return EMPTY_ARRAY;

    return labIds.filter((labId, index) => {
      const ownerData = ownerResults[index]?.data;
      const labOwner = ownerData?.owner || ownerData;
      return labOwner && labOwner.toLowerCase() === ownerAddress.toLowerCase();
    });
  }, [labIds, ownerAddress, ownerResults]);

  const creatorHashResults = useQueries({
    queries: ownerMatchedLabIds.length > 0 && options.creatorPucHash
      ? ownerMatchedLabIds.map((labId) => ({
          queryKey: labQueryKeys.getCreatorPucHash(labId),
          queryFn: () => useLabCreatorPucHashSSO.queryFn(labId),
          enabled: !!labId,
          ...LAB_QUERY_CONFIG,
        }))
      : [],
    combine: (results) => results
  });

  const ownedLabIds = useMemo(() => {
    if (!options.creatorPucHash) {
      return ownerMatchedLabIds;
    }

    return ownerMatchedLabIds.filter((labId, index) => {
      const creatorHashData = creatorHashResults[index]?.data;
      const creatorPucHash = creatorHashData?.creatorPucHash || creatorHashData;
      return (
        typeof creatorPucHash === 'string'
        && creatorPucHash.toLowerCase() === options.creatorPucHash.toLowerCase()
      );
    });
  }, [creatorHashResults, options.creatorPucHash, ownerMatchedLabIds]);

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

  usePruneDeletedLabIds(ownedLabIds, labDetailResults, listingResults);

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
                   creatorHashResults.some(r => r.isLoading) ||
                   labDetailResults.some(r => r.isLoading) ||
                   listingResults.some(r => r.isLoading) ||
                   metadataResults.some(r => r.isLoading) ||
                   imageResults.some(r => r.isLoading);

  const hasCriticalError = Boolean(labIdsResult.error);
  const hasRecoverableErrors =
    creatorHashResults.some(r => r.error) ||
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

  const shouldReportError =
    hasCriticalError || (ownedLabs.length === 0 && hasRecoverableErrors);
  const firstRecoverableError =
    creatorHashResults.find(r => r.error)?.error ||
    labDetailResults.find(r => r.error)?.error ||
    null;

  devLog.log('👨‍🔬 useLabsForProvider - Result:', {
    ownerAddress,
    totalLabsChecked: labIds.length,
    ownerMatchedLabsCount: ownerMatchedLabIds.length,
    ownedLabsCount: ownedLabs.length,
    ownedLabIds: ownedLabs.map(lab => lab.id)
  });

  return {
    data: { labs: ownedLabs, totalLabs: ownedLabs.length },
    isLoading,
    isSuccess: !shouldReportError,
    isError: shouldReportError,
    error: hasCriticalError ? labIdsResult.error : (shouldReportError ? firstRecoverableError : null),
    refetch: () => {
      labIdsResult.refetch();
      ownerResults.forEach(r => r.refetch && r.refetch());
      creatorHashResults.forEach(r => r.refetch && r.refetch());
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
 * API endpoints are read-only blockchain queries used by the institutional runtime
 */
export const useLabsForReservation = (options = {}) => {
  // Step 1: Get all lab IDs - Use SSO variant directly per architecture
  const labIdsResult = useAllLabsSSO({
    ...LAB_QUERY_CONFIG,
    enabled: options.enabled !== false,
    // Convert BigInt IDs to numbers in select to prevent serialization errors
    select: normalizeLabIds
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

  usePruneDeletedLabIds(labIds, labDetailResults, listingResults);

  // Get lab data with IDs - only for listed labs
  const labsWithDetails = useMemo(() => {
    if (labDetailResults.length === 0) {
      return EMPTY_ARRAY;
    }

    return labDetailResults
      .filter((result, index) => {
        const listingResult = listingResults[index];
        const isListed = listingResult?.data?.isListed;
        if (listingResult?.error) {
          return result.isSuccess && result.data;
        }
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
  
  const hasCriticalError = Boolean(labIdsResult.error);
  const hasRecoverableErrors = labDetailResults.some(r => r.error);

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

  const shouldReportError =
    hasCriticalError || (enrichedLabs.length === 0 && hasRecoverableErrors);
  const firstRecoverableError = labDetailResults.find(r => r.error)?.error || null;

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
    isSuccess: !shouldReportError,
    isError: shouldReportError,
    error: hasCriticalError ? labIdsResult.error : (shouldReportError ? firstRecoverableError : null),
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
