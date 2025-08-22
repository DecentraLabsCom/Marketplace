/**
 * Composed React Query Hooks for Lab-related operations
 * These hooks use useQueries to orchestrate multiple related atomic hooks while maintaining
 * React Query's caching, error handling, and retry capabilities
 * 
 * Uses atomic hook queryFn exports instead of direct fetch calls for consistency and shared caching
 */
import { useQueries } from '@tanstack/react-query'
import { 
  useAllLabs, 
  useLab,
  useOwnerOf,
  LAB_QUERY_CONFIG, // ✅ Import shared configuration
} from './useLabs'
import { useGetLabProvidersQuery, USER_QUERY_CONFIG } from '@/hooks/user/useUsers'
import { useMetadata, METADATA_QUERY_CONFIG } from '@/hooks/metadata/useMetadata'
import { useLabImageQuery } from '@/hooks/metadata/useLabImage'
import { useLabToken } from '@/context/LabTokenContext'
import { labQueryKeys, metadataQueryKeys, labImageQueryKeys } from '@/utils/hooks/queryKeys'
import devLog from '@/utils/dev/logger'

/**
 * Helper function to format wallet address for display
 * Shows first 3 and last 3 characters separated by ellipsis
 * @param {string} address - The wallet address to format
 * @returns {string} Formatted address (e.g., "0x1...abc")
 */
const formatWalletAddress = (address) => {
  if (!address || address.length < 7) return address;
  return `${address.substring(0, 3)}...${address.substring(address.length - 3)}`;
};

// Get LAB token decimals using the useLabToken hook
const useLabTokenDecimals = () => {
  const { decimals } = useLabToken();
  return {
    data: decimals,
    isLoading: decimals === undefined,
    isSuccess: decimals !== undefined,
    isError: false,
    error: null
  };
};

/**
 * Composed hook for getting all labs with enriched data
 * Orchestrates multiple atomic hooks: labs list (IDs), individual lab details, decimals, owner data for provider matching, and optional metadata/images
 * 
 * RESILIENT LOADING BEHAVIOR:
 * - Lab data loads immediately when basic queries complete
 * - Owner queries run in background and NEVER block UI loading
 * - Failed/stuck owner queries fall back to "Unknown Provider" gracefully
 * - Cards display with provider info when available, "Unknown Provider" when not
 * 
 * @param {Object} options - Configuration options
 * @param {boolean} options.includeMetadata - Whether to fetch metadata for each lab
 * @param {boolean} options.includeOwnerAddresses - Whether to include owner addresses in the output (owner data is always fetched for provider matching)
 * @param {boolean} options.includeImages - Whether to cache images from metadata (default: true for better performance)
 * @param {Object} options.queryOptions - Override options for base queries (labIds & providers only)
 *                                        Internal queries use optimized configurations and cannot be overridden
 * @returns {Object} React Query result with enriched lab data and comprehensive status
 */
export const useAllLabsComposed = ({ 
  includeMetadata = true, 
  includeOwnerAddresses = false, 
  includeImages = true,
  queryOptions = {} 
} = {}) => {
  
  // Step 1: Get all lab IDs using the atomic hook
  const labIdsResult = useAllLabs({
    ...LAB_QUERY_CONFIG,
    // Only allow override of non-critical options like enabled, meta, etc.
    enabled: queryOptions.enabled,
    meta: queryOptions.meta,
  });
  const decimalsResult = useLabTokenDecimals();

  // Get providers data for owner matching (when owners are included)
  const providersResult = useGetLabProvidersQuery({
    ...USER_QUERY_CONFIG,
    // Only allow override of non-critical options like enabled, meta, etc.
    enabled: queryOptions.enabled,
    meta: queryOptions.meta,
  });

  // Get lab IDs from the atomic hook result (getAllLabs returns array of ID strings)
  const labIds = labIdsResult.data || [];
  
  // Step 2: Get detailed lab data for each ID using atomic hooks
  const labDetailResults = useQueries({
    queries: labIds.length > 0 
      ? labIds.map(labId => ({
          queryKey: labQueryKeys.getLab(labId),
          queryFn: () => useLab.queryFn(labId), // ✅ Using atomic hook queryFn
          enabled: !!labId,
          ...LAB_QUERY_CONFIG,
          // Note: queryOptions not spread here as LAB_QUERY_CONFIG is optimized for lab data
        }))
      : [],
    combine: (results) => results
  });

  // Get lab data with IDs
  const labsWithDetails = labDetailResults
    .filter(result => result.isSuccess && result.data)
    .map(result => result.data);

  // Step 3: Get owner data for provider matching
  const ownerResults = useQueries({
    queries: labsWithDetails.length > 0
      ? labsWithDetails.map(lab => ({
          queryKey: labQueryKeys.ownerOf(lab.labId),
          queryFn: () => useOwnerOf.queryFn(lab.labId), // ✅ Using atomic hook queryFn
          enabled: !!lab.labId,
          ...LAB_QUERY_CONFIG,
          // Use select to provide fallback data on error
          select: (data) => data,
          // Note: queryOptions not spread here as LAB_QUERY_CONFIG is optimized for lab data
        }))
      : [],
    combine: (results) => results
  });

  // Step 4: Create metadata queries if requested 
  const metadataResults = useQueries({
    queries: (includeMetadata && labsWithDetails.length > 0) 
      ? labsWithDetails.map(lab => {
          // Use the URI from lab.base.uri for metadata
          const metadataUri = lab.base?.uri;
          return {
            queryKey: metadataQueryKeys.byUri(metadataUri),
            queryFn: () => useMetadata.queryFn(metadataUri),
            enabled: !!metadataUri,
            ...METADATA_QUERY_CONFIG, // ✅ Metadata-specific configuration
            // Note: queryOptions not spread here as METADATA_QUERY_CONFIG is optimized for metadata
          };
        })
      : [],
    combine: (results) => results
  });

  // Step 5: Get image caching if requested and we have metadata
  // Extract image URLs from metadata for caching
  const imageUrlsToCache = [];
  const labImageMap = new Map(); // Map lab index to image URLs

  if (includeImages && includeMetadata && metadataResults.length > 0) {
    metadataResults.forEach((metadataResult, index) => {
      if (metadataResult.isSuccess && metadataResult.data) {
        const metadata = metadataResult.data;
        const labImages = [];
        
        // Extract main image
        if (metadata.image) labImages.push(metadata.image);
        
        // Extract additional images from images array
        if (metadata.images && Array.isArray(metadata.images)) {
          labImages.push(...metadata.images.filter(Boolean));
        }
        
        // Extract images from attributes
        if (metadata.attributes) {
          const additionalImagesAttr = metadata.attributes.find(
            attr => attr.trait_type === 'additionalImages'
          );
          if (additionalImagesAttr?.value && Array.isArray(additionalImagesAttr.value)) {
            labImages.push(...additionalImagesAttr.value.filter(Boolean));
          }
        }
        
        // Remove duplicates and store mapping
        const uniqueLabImages = [...new Set(labImages)];
        labImageMap.set(index, uniqueLabImages);
        imageUrlsToCache.push(...uniqueLabImages);
      }
    });
  }

  // Remove duplicate URLs across all labs
  const uniqueImageUrls = [...new Set(imageUrlsToCache)];

  // Create image cache queries
  const imageResults = useQueries({
    queries: (includeImages && uniqueImageUrls.length > 0)
      ? uniqueImageUrls.map(imageUrl => ({
          queryKey: labImageQueryKeys.byUrl(imageUrl),
          queryFn: () => useLabImageQuery.queryFn(imageUrl), // Using the atomic queryFn
          enabled: !!imageUrl,
          staleTime: 48 * 60 * 60 * 1000,    // 48 hours for images
          gcTime: 7 * 24 * 60 * 60 * 1000,   // 7 days
          refetchOnWindowFocus: false,
          refetchOnReconnect: true,
          retry: 2,
        }))
      : [],
    combine: (results) => results
  });

  // Create a map of cached images for easy lookup
  const cachedImageMap = new Map();
  if (includeImages && imageResults.length > 0) {
    imageResults.forEach((imageResult, index) => {
      if (imageResult.isSuccess && imageResult.data?.dataUrl) {
        const originalUrl = uniqueImageUrls[index];
        cachedImageMap.set(originalUrl, imageResult.data.dataUrl);
      }
    });
  }

  // Process and combine all results
  const isBaseLoading = labIdsResult.isLoading || decimalsResult.isLoading;
  // Note: providersResult.isLoading is not included since we have fallback logic
  const isLabDetailsLoading = labDetailResults.some(result => result.isLoading);
  const isImageCachingLoading = imageResults.some(result => result.isLoading);
  
  // Owner queries are completely background - NEVER wait for them to complete
  // They load in the background and gracefully fall back to "Unknown Provider"
  
  const isEnrichmentLoading = metadataResults.some(result => result.isLoading) ||
                             providersResult.isLoading || // Moved here since providers are for enrichment
                             (includeImages && isImageCachingLoading); // Include image caching in enrichment loading
  const isLoading = isBaseLoading || isLabDetailsLoading || isEnrichmentLoading;

  const baseErrors = [];
  if (labIdsResult.error) baseErrors.push(labIdsResult.error);
  if (decimalsResult.error) baseErrors.push(decimalsResult.error);
  // Note: providersResult.error is moved to enrichmentErrors since we have fallbacks
  
  const labDetailErrors = labDetailResults.filter(result => result.error).map(result => result.error);
  const imageErrors = imageResults.filter(result => result.error).map(result => result.error);
  
  // Owner errors are not critical - they should be treated as enrichment errors
  const ownerErrors = ownerResults.filter(result => result.error).map(result => result.error);
  const enrichmentErrors = [
    ...ownerErrors, // Owner errors are not critical - we have fallbacks
    ...metadataResults.filter(result => result.error).map(result => result.error),
    ...imageErrors
  ];
  
  // Add providers error to enrichment errors since we have fallback logic
  if (providersResult.error) enrichmentErrors.push(providersResult.error);
  
  const hasErrors = baseErrors.length > 0 || labDetailErrors.length > 0;
  const hasPartialErrors = enrichmentErrors.length > 0;

  // Enrich labs with metadata and owner data
  const enrichedLabs = labsWithDetails.map((lab, labIndex) => {
    const enrichedLab = { 
      // Start with basic lab data and ensure we have an id
      id: lab.labId,
      labId: lab.labId,
      tokenId: lab.labId,
      ...lab.base,
    };

    // Get owner data - always try to get it for provider matching, handle failures gracefully
    const ownerData = ownerResults[labIndex]?.data || null;
    const ownerAddress = ownerData?.owner || ownerData;
    const ownerQueryFailed = ownerResults[labIndex]?.error || ownerResults[labIndex]?.isError;
    
    // Add owner data to output only if explicitly requested AND successfully obtained
    if (includeOwnerAddresses && ownerAddress && !ownerQueryFailed) {
      enrichedLab.owner = ownerAddress;
    }

    // Get provider info by matching lab owner with provider accounts (only if we have owner data)
    if (providersResult.data?.providers && ownerAddress && !ownerQueryFailed) {
      const matchingProvider = providersResult.data.providers.find(
        provider => provider.account.toLowerCase() === ownerAddress.toLowerCase()
      );
      if (matchingProvider) {
        enrichedLab.providerInfo = {
          name: matchingProvider.name,
          email: matchingProvider.email,
          country: matchingProvider.country,
          account: matchingProvider.account
        };
        enrichedLab.provider = matchingProvider.name; // Use provider name as display name
      }
    }
    
    // Fallback provider logic with multiple sources
    if (!enrichedLab.provider) {
      if (ownerAddress && !ownerQueryFailed) {
        // Use formatted wallet address as fallback if we have owner data
        enrichedLab.provider = formatWalletAddress(ownerAddress);
      } else if (lab.base?.uri) {
        // Extract provider from metadata URI if owner data failed (e.g., Lab-UNED-54.json -> UNED)
        const uriMatch = lab.base.uri.match(/Lab-([A-Z]+)-\d+/);
        if (uriMatch) {
          enrichedLab.provider = uriMatch[1]; // Extract UNED, UHU, UBC, etc.
        } else {
          enrichedLab.provider = 'Unknown Provider';
        }
      } else {
        enrichedLab.provider = 'Unknown Provider';
      }
    }

    // Add metadata if requested and available
    if (includeMetadata && metadataResults[labIndex]?.data) {
      const metadata = metadataResults[labIndex].data;
      // Merge metadata properties into the lab object for easier access
      enrichedLab.metadata = metadata;
      if (metadata.name) enrichedLab.name = metadata.name;
      if (metadata.description) enrichedLab.description = metadata.description;
      if (metadata.image) enrichedLab.image = metadata.image;
      if (metadata.images) enrichedLab.images = metadata.images;
      if (metadata.category) enrichedLab.category = metadata.category;
      if (metadata.provider) enrichedLab.provider = metadata.provider;
      if (metadata.keywords) enrichedLab.keywords = metadata.keywords;
      
      // Extract provider from metadata URI if not found from contract (fallback)
      if (!enrichedLab.provider && lab.base?.uri) {
        const uriMatch = lab.base.uri.match(/Lab-([A-Z]+)-\d+/);
        if (uriMatch) {
          enrichedLab.provider = uriMatch[1]; // Extract UNED, UHU, UBC, etc.
        }
      }
      
      // Extract category from attributes if not directly available
      if (!enrichedLab.category && metadata.attributes) {
        const categoryAttr = metadata.attributes.find(attr => attr.trait_type === 'category');
        if (categoryAttr) enrichedLab.category = categoryAttr.value;
      }
      
      // Extract keywords from attributes if not directly available
      if (!enrichedLab.keywords && metadata.attributes) {
        const keywordsAttr = metadata.attributes.find(attr => attr.trait_type === 'keywords');
        if (keywordsAttr) enrichedLab.keywords = keywordsAttr.value;
      }
      
      // Extract timeSlots from attributes if not directly available
      if (!enrichedLab.timeSlots && metadata.attributes) {
        const timeSlotsAttr = metadata.attributes.find(attr => attr.trait_type === 'timeSlots');
        if (timeSlotsAttr) enrichedLab.timeSlots = timeSlotsAttr.value;
      }
      
      // Extract opens and closes dates from attributes if not directly available
      if (!enrichedLab.opens && metadata.attributes) {
        const opensAttr = metadata.attributes.find(attr => attr.trait_type === 'opens');
        if (opensAttr) enrichedLab.opens = opensAttr.value;
      }
      
      if (!enrichedLab.closes && metadata.attributes) {
        const closesAttr = metadata.attributes.find(attr => attr.trait_type === 'closes');
        if (closesAttr) enrichedLab.closes = closesAttr.value;
      }
      
      // Extract docs from attributes if not directly available
      if (!enrichedLab.docs && metadata.attributes) {
        const docsAttr = metadata.attributes.find(attr => attr.trait_type === 'docs');
        if (docsAttr) enrichedLab.docs = docsAttr.value;
      }
      
      // Extract additional images from attributes
      if (metadata.attributes) {
        const additionalImagesAttr = metadata.attributes.find(attr => attr.trait_type === 'additionalImages');
        if (additionalImagesAttr && additionalImagesAttr.value) {
          enrichedLab.images = [metadata.image, ...additionalImagesAttr.value].filter(Boolean);
        }
      }
      
      // If no images array exists, create one with the main image
      if (!enrichedLab.images && enrichedLab.image) {
        enrichedLab.images = [enrichedLab.image];
      }
    }

    // Step 6: Add cached images if requested
    if (includeImages && includeMetadata) {
      const labImages = labImageMap.get(labIndex) || [];
      
      // Add cached image URLs
      if (labImages.length > 0) {
        // Set the main cached image (first image) 
        const mainImageUrl = labImages[0];
        const cachedMainImage = cachedImageMap.get(mainImageUrl);
        if (cachedMainImage) {
          enrichedLab.cachedImageUrl = cachedMainImage;
        }
        
        // Set all cached images
        enrichedLab.cachedImages = labImages.map(imageUrl => 
          cachedImageMap.get(imageUrl) || imageUrl // Use cached version or fallback to original
        );
        
        // Add image cache metadata
        enrichedLab.imageCache = {
          totalImages: labImages.length,
          cachedCount: labImages.filter(url => cachedImageMap.has(url)).length,
          mainImageCached: !!cachedMainImage,
          originalUrls: labImages,
        };
      } else {
        // No images found in metadata
        enrichedLab.imageCache = {
          totalImages: 0,
          cachedCount: 0,
          mainImageCached: false,
          originalUrls: [],
        };
      }
    }

    // Ensure we have fallback values for required props
    if (!enrichedLab.name) enrichedLab.name = `Lab ${enrichedLab.id}`;
    
    // Provider fallback logic (this is already handled above, but ensure we always have a value)
    if (!enrichedLab.provider) {
      enrichedLab.provider = 'Unknown Provider';
    }
    
    if (!enrichedLab.price) enrichedLab.price = '0';
    
    // Ensure we have fallback values for timeSlots if not available in metadata
    if (!enrichedLab.timeSlots || !Array.isArray(enrichedLab.timeSlots)) {
      enrichedLab.timeSlots = [15, 30, 60]; // Default time slots
    }

    return enrichedLab;
  });

  // Comprehensive status information
  const allResults = [labIdsResult, decimalsResult, providersResult, ...labDetailResults, ...ownerResults, ...metadataResults];
  if (includeImages) {
    allResults.push(...imageResults);
  }
  const totalQueries = allResults.length;
  const successfulQueries = allResults.filter(r => r.isSuccess && !r.error).length;
  const failedQueries = allResults.filter(r => r.error).length;

  return {
    // Data
    data: {
      labs: enrichedLabs,
      totalLabs: enrichedLabs.length,
      decimals: decimalsResult.data,
    },
    
    // Status
    isLoading,
    isSuccess: !hasErrors && successfulQueries > 0,
    isError: hasErrors,
    error: baseErrors[0] || labDetailErrors[0] || null,
    
    // Comprehensive meta information
    meta: {
      includeMetadata,
      includeOwnerAddresses,
      totalQueries,
      successfulQueries,
      failedQueries,
      hasPartialFailures: hasPartialErrors,
      baseQueries: {
        labIds: {
          isLoading: labIdsResult.isLoading,
          isSuccess: labIdsResult.isSuccess,
          isError: labIdsResult.isError,
          error: labIdsResult.error
        },
        labDetails: {
          totalQueries: labDetailResults.length,
          successfulQueries: labDetailResults.filter(r => r.isSuccess).length,
          failedQueries: labDetailResults.filter(r => r.error).length,
        },
        decimals: {
          isLoading: decimalsResult.isLoading,
          isSuccess: decimalsResult.isSuccess,
          isError: decimalsResult.isError,
          error: decimalsResult.error
        },
        providers: {
          isLoading: providersResult.isLoading,
          isSuccess: providersResult.isSuccess,
          isError: providersResult.isError,
          error: providersResult.error,
          count: providersResult.data?.count || 0
        }
      },
      enrichmentStatus: {
        totalOwnerQueries: ownerResults.length,
        successfulOwners: ownerResults.filter(r => r.isSuccess).length,
        failedOwners: ownerResults.filter(r => r.error).length,
        totalMetadataQueries: metadataResults.length,
        successfulMetadata: metadataResults.filter(r => r.isSuccess).length,
        failedMetadata: metadataResults.filter(r => r.error).length,
        totalImageQueries: includeImages ? imageResults.length : 0,
        successfulImages: includeImages ? imageResults.filter(r => r.isSuccess).length : 0,
        failedImages: includeImages ? imageResults.filter(r => r.error).length : 0,
        cachedImagesCount: cachedImageMap.size,
        uniqueImageUrls: uniqueImageUrls.length,
      },
      errors: [...baseErrors, ...labDetailErrors, ...enrichmentErrors],
      timestamp: new Date().toISOString()
    },

    // Individual result access for advanced use cases
    baseResults: {
      labIds: labIdsResult,
      labDetails: labDetailResults,
      decimals: decimalsResult,
      providers: providersResult,
    },
    ownerResults,
    metadataResults,
    imageResults,

    // Utility functions
    refetch: () => {
      labIdsResult.refetch();
      providersResult.refetch();
      labDetailResults.forEach(result => result.refetch && result.refetch());
      // Note: decimalsResult.refetch not available as it uses useLabToken
      ownerResults.forEach(result => result.refetch && result.refetch());
      metadataResults.forEach(result => result.refetch && result.refetch());
      if (includeImages) {
        imageResults.forEach(result => result.refetch && result.refetch());
      }
    },
    
    // React Query status aggregation
    isFetching: allResults.some(r => r.isFetching),
    isPaused: allResults.some(r => r.isPaused),
    isStale: allResults.some(r => r.isStale),
  };
};

/**
 * Cache extraction helper for finding a specific lab from the composed data
 * @param {Object} composedResult - Result from useAllLabsComposed
 * @param {string|number} labId - Lab ID to find
 * @returns {Object|null} Lab data if found, null otherwise
 */
export const extractLabFromComposed = (composedResult, labId) => {
  if (!composedResult?.data?.labs || !labId) return null;
  
  return composedResult.data.labs.find(lab => 
    (lab.labId && lab.labId.toString() === labId.toString()) ||
    (lab.tokenId && lab.tokenId.toString() === labId.toString()) ||
    (lab.id && lab.id.toString() === labId.toString())
  ) || null;
};

/**
 * Cache extraction helper for filtering labs by owner from composed data
 * @param {Object} composedResult - Result from useAllLabsComposed (must include owners)
 * @param {string} ownerAddress - Owner address to filter by
 * @returns {Array} Array of labs owned by the address
 */
export const extractLabsByOwner = (composedResult, ownerAddress) => {
  // Safety checks: ensure we have valid data structure and owner address
  if (!composedResult || !composedResult.data || !Array.isArray(composedResult.data.labs) || !ownerAddress) {
    return [];
  }
  
  try {
    return composedResult.data.labs.filter(lab => 
      lab.owner && lab.owner.toLowerCase() === ownerAddress.toLowerCase()
    );
  } catch (error) {
    console.error('Error filtering labs by owner:', error);
    return [];
  }
};

// Module loaded confirmation (only logs once even in StrictMode)
devLog.moduleLoaded('✅ Lab composed hooks loaded');
