/**
 * Specialized Lab Hooks - Optimized for specific use cases
 * These hooks use atomic queries + React Query 'select' for maximum performance
 * Following the same pattern as useBookingSpecializedQueries
 */
import { 
  useAllLabs, 
  useLab,
  useOwnerOf,
  LAB_QUERY_CONFIG 
} from './useLabAtomicQueries'
import { useProviderMapping } from '@/utils/hooks/useProviderMapping'
import { useMetadata, METADATA_QUERY_CONFIG } from '@/hooks/metadata/useMetadata'
import { useLabImageQuery } from '@/hooks/metadata/useLabImage'
import { useQueries } from '@tanstack/react-query'
import { labQueryKeys, metadataQueryKeys, labImageQueryKeys } from '@/utils/hooks/queryKeys'
import devLog from '@/utils/dev/logger'

/**
 * Helper function to format wallet address for display
 */
const formatWalletAddress = (address) => {
  if (!address || address.length < 7) return address;
  return `${address.substring(0, 3)}...${address.substring(address.length - 3)}`;
};

/**
 * Specialized hook for Market component
 * Gets all labs with provider mapping but minimal data transformation
 * Optimized for filtering and display in lab grid
 * @param {Object} options - Configuration options
 * @returns {Object} Lab data optimized for market display
 */
export const useLabsForMarket = (options = {}) => {
  // Step 1: Get all lab IDs
  const labIdsResult = useAllLabs({
    ...LAB_QUERY_CONFIG,
    enabled: options.enabled !== false,
    
    // ✅ Use select to just return the IDs array
    select: (data) => data || []
  });

  const labIds = labIdsResult.data || [];

  // Step 2: Provider mapping
  const providerMapping = useProviderMapping({
    enabled: labIds.length > 0
  });

  // Step 3: Get lab details for all labs
  const labDetailResults = useQueries({
    queries: labIds.length > 0 
      ? labIds.map(labId => ({
          queryKey: labQueryKeys.getLab(labId),
          queryFn: () => useLab.queryFn(labId),
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
          queryFn: () => useOwnerOf.queryFn(labId),
          enabled: !!labId,
          ...LAB_QUERY_CONFIG,
        }))
      : [],
    combine: (results) => results
  });

  // Step 5: Get metadata for labs
  const metadataResults = useQueries({
    queries: labDetailResults.length > 0
      ? labDetailResults.map((result, index) => {
          const lab = result.data;
          const metadataUri = lab?.base?.uri;
          return {
            queryKey: metadataQueryKeys.byUri(metadataUri),
            queryFn: () => useMetadata.queryFn(metadataUri),
            enabled: !!metadataUri && result.isSuccess,
            ...METADATA_QUERY_CONFIG,
          };
        })
      : [],
    combine: (results) => results
  });

  // Step 6: Extract and cache images from metadata
  const imageUrlsToCache = [];
  const labImageMap = new Map(); // Map lab index to image URLs

  if (metadataResults.length > 0) {
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

  // Step 7: Create image cache queries
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
                   metadataResults.some(r => r.isLoading) ||
                   imageResults.some(r => r.isLoading) ||
                   providerMapping.isLoading;

  const hasErrors = labIdsResult.error || 
                   labDetailResults.some(r => r.error) ||
                   ownerResults.some(r => r.error);

  // Transform data for market display
  const labs = labDetailResults
    .filter(result => result.isSuccess && result.data)
    .map((labResult, index) => {
      const lab = labResult.data;
      const ownerData = ownerResults[index]?.data;
      const ownerAddress = ownerData?.owner || ownerData;
      const metadata = metadataResults[index]?.data;

      const enrichedLab = {
        id: lab.labId,
        labId: lab.labId,
        tokenId: lab.labId,
        ...lab.base,
      };

      // Add metadata
      if (metadata) {
        if (metadata.name) enrichedLab.name = metadata.name;
        if (metadata.description) enrichedLab.description = metadata.description;
        if (metadata.image) enrichedLab.image = metadata.image;
        if (metadata.category) enrichedLab.category = metadata.category;
        if (metadata.keywords) enrichedLab.keywords = metadata.keywords;
        
        // Normalize images array: combine all available images
        const allImages = [];
        
        // Add main image first if exists
        if (metadata.image) allImages.push(metadata.image);
        
        // Add direct images array if exists
        if (metadata.images && Array.isArray(metadata.images)) {
          allImages.push(...metadata.images.filter(Boolean));
        }
        
        // Add additional images from attributes if exists
        if (metadata.attributes) {
          const additionalImagesAttr = metadata.attributes.find(attr => attr.trait_type === 'additionalImages');
          if (additionalImagesAttr?.value && Array.isArray(additionalImagesAttr.value)) {
            allImages.push(...additionalImagesAttr.value.filter(Boolean));
          }
        }
        
        // Remove duplicates and set as images array
        enrichedLab.images = [...new Set(allImages)];
        
        // Add image URLs mapped to this lab
        const labImages = labImageMap.get(index) || [];
        if (labImages.length > 0) {
          enrichedLab.imageUrls = labImages;
          // Set primary image if not already set
          if (!enrichedLab.image && labImages[0]) {
            enrichedLab.image = labImages[0];
          }
        }
      }

      // Add provider info with mapping
      if (ownerAddress) {
        const providerInfo = providerMapping.mapOwnerToProvider(ownerAddress);
        
        if (providerInfo) {
          enrichedLab.provider = providerInfo.name;
          enrichedLab.providerInfo = {
            name: providerInfo.name,
            email: providerInfo.email,
            country: providerInfo.country,
            account: providerInfo.account
          };
        } else {
          enrichedLab.provider = formatWalletAddress(ownerAddress);
        }
      }

      // Fallbacks
      if (!enrichedLab.provider) {
        if (lab.base?.uri) {
          const uriMatch = lab.base.uri.match(/Lab-([A-Z]+)-\d+/);
          enrichedLab.provider = uriMatch ? uriMatch[1] : 'Unknown Provider';
        } else {
          enrichedLab.provider = 'Unknown Provider';
        }
      }

      if (!enrichedLab.name) enrichedLab.name = `Lab ${enrichedLab.id}`;
      if (!enrichedLab.price) enrichedLab.price = '0';
      if (!enrichedLab.timeSlots || !Array.isArray(enrichedLab.timeSlots)) {
        enrichedLab.timeSlots = [15, 30, 60];
      }

      return enrichedLab;
    });

  devLog.log('🏪 useLabsForMarket - Result:', {
    totalLabs: labs.length,
    sampleProviders: labs.slice(0, 3).map(lab => lab.provider)
  });

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
  const ownerResult = useOwnerOf(normalizedLabId, {
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
  const imageUrlsToCache = [];
  const metadata = metadataResult.data;
  
  if (metadata) {
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
    
    // Remove duplicates
    const uniqueLabImages = [...new Set(labImages)];
    imageUrlsToCache.push(...uniqueLabImages);
  }

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

  const isLoading = labResult.isLoading || ownerResult.isLoading || metadataResult.isLoading || imageResults.some(r => r.isLoading);
  const hasErrors = labResult.error || ownerResult.error || metadataResult.error;

  // Transform data
  const lab = labResult.data ? (() => {
    const lab = labResult.data;
    const ownerData = ownerResult.data;
    const ownerAddress = ownerData?.owner || ownerData;
    const metadata = metadataResult.data;

    const enrichedLab = {
      id: lab.labId,
      labId: lab.labId,
      tokenId: lab.labId,
      ...lab.base,
    };

    // Add metadata
    if (metadata) {
      if (metadata.name) enrichedLab.name = metadata.name;
      if (metadata.description) enrichedLab.description = metadata.description;
      if (metadata.image) enrichedLab.image = metadata.image;
      if (metadata.category) enrichedLab.category = metadata.category;
      if (metadata.keywords) enrichedLab.keywords = metadata.keywords;
      if (metadata.attributes) {
        // Extract timeSlots, docs, etc. from attributes
        const timeSlotsAttr = metadata.attributes.find(attr => attr.trait_type === 'timeSlots');
        if (timeSlotsAttr) enrichedLab.timeSlots = timeSlotsAttr.value;
        
        const docsAttr = metadata.attributes.find(attr => attr.trait_type === 'docs');
        if (docsAttr) enrichedLab.docs = docsAttr.value;
      }

      // Normalize images array: combine all available images
      const allImages = [];
      
      // Add main image first if exists
      if (metadata.image) allImages.push(metadata.image);
      
      // Add direct images array if exists
      if (metadata.images && Array.isArray(metadata.images)) {
        allImages.push(...metadata.images.filter(Boolean));
      }
      
      // Add additional images from attributes if exists
      if (metadata.attributes) {
        const additionalImagesAttr = metadata.attributes.find(attr => attr.trait_type === 'additionalImages');
        if (additionalImagesAttr?.value && Array.isArray(additionalImagesAttr.value)) {
          allImages.push(...additionalImagesAttr.value.filter(Boolean));
        }
      }
      
      // Remove duplicates and set as images array
      enrichedLab.images = [...new Set(allImages)];

      // Add cached image URLs
      if (imageUrlsToCache.length > 0) {
        enrichedLab.imageUrls = imageUrlsToCache;
        // Set primary image if not already set
        if (!enrichedLab.image && imageUrlsToCache[0]) {
          enrichedLab.image = imageUrlsToCache[0];
        }
      }
    }

    // Add provider info
    if (ownerAddress) {
      const providerInfo = providerMapping.mapOwnerToProvider(ownerAddress);
      
      if (providerInfo) {
        enrichedLab.provider = providerInfo.name;
        enrichedLab.providerInfo = providerInfo;
      } else {
        enrichedLab.provider = formatWalletAddress(ownerAddress);
      }
    }

    // Fallbacks
    if (!enrichedLab.provider) {
      if (lab.base?.uri) {
        const uriMatch = lab.base.uri.match(/Lab-([A-Z]+)-\d+/);
        enrichedLab.provider = uriMatch ? uriMatch[1] : 'Unknown Provider';
      } else {
        enrichedLab.provider = 'Unknown Provider';
      }
    }

    if (!enrichedLab.name) enrichedLab.name = `Lab ${enrichedLab.id}`;
    if (!enrichedLab.price) enrichedLab.price = '0';
    if (!enrichedLab.timeSlots || !Array.isArray(enrichedLab.timeSlots)) {
      enrichedLab.timeSlots = [15, 30, 60];
    }

    return enrichedLab;
  })() : null;

  devLog.log('🔍 useLabById - Result:', {
    labId: normalizedLabId,
    found: !!lab,
    labName: lab?.name,
    provider: lab?.provider
  });

  return {
    data: lab,
    isLoading,
    isSuccess: !hasErrors && !!lab,
    isError: hasErrors,
    error: labResult.error || ownerResult.error || metadataResult.error,
    refetch: () => {
      labResult.refetch();
      ownerResult.refetch();
      metadataResult.refetch();
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
 */
export const useLabsForProvider = (ownerAddress, options = {}) => {
  // Get all lab IDs first
  const labIdsResult = useAllLabs({
    ...LAB_QUERY_CONFIG,
    enabled: !!ownerAddress && (options.enabled !== false),
  });

  const labIds = labIdsResult.data || [];

  // Get all owner data to filter
  const ownerResults = useQueries({
    queries: labIds.length > 0
      ? labIds.map(labId => ({
          queryKey: labQueryKeys.ownerOf(labId),
          queryFn: () => useOwnerOf.queryFn(labId),
          enabled: !!labId,
          ...LAB_QUERY_CONFIG,
        }))
      : [],
    combine: (results) => results
  });

  // Filter lab IDs by ownership and get details only for owned labs
  const ownedLabIds = labIds.filter((labId, index) => {
    const ownerData = ownerResults[index]?.data;
    const labOwner = ownerData?.owner || ownerData;
    return labOwner && labOwner.toLowerCase() === ownerAddress.toLowerCase();
  });

  // Get lab details only for owned labs
  const labDetailResults = useQueries({
    queries: ownedLabIds.length > 0 
      ? ownedLabIds.map(labId => ({
          queryKey: labQueryKeys.getLab(labId),
          queryFn: () => useLab.queryFn(labId),
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
            queryKey: metadataQueryKeys.byUri(metadataUri),
            queryFn: () => useMetadata.queryFn(metadataUri),
            enabled: !!metadataUri && result.isSuccess,
            ...METADATA_QUERY_CONFIG,
          };
        })
      : [],
    combine: (results) => results
  });

  // Extract and cache images from metadata
  const imageUrlsToCache = [];
  const labImageMap = new Map(); // Map lab index to image URLs

  if (metadataResults.length > 0) {
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
                   metadataResults.some(r => r.isLoading) ||
                   imageResults.some(r => r.isLoading);

  const hasErrors = labIdsResult.error || 
                   labDetailResults.some(r => r.error);

  // Transform data
  const ownedLabs = labDetailResults
    .filter(result => result.isSuccess && result.data)
    .map((labResult, index) => {
      const lab = labResult.data;
      const metadata = metadataResults[index]?.data;

      const enrichedLab = {
        id: lab.labId,
        labId: lab.labId,
        tokenId: lab.labId,
        owner: ownerAddress, // We know the owner
        ...lab.base,
      };

      // Add metadata
      if (metadata) {
        if (metadata.name) enrichedLab.name = metadata.name;
        if (metadata.description) enrichedLab.description = metadata.description;
        if (metadata.image) enrichedLab.image = metadata.image;
        if (metadata.category) enrichedLab.category = metadata.category;
        if (metadata.keywords) enrichedLab.keywords = metadata.keywords;
        if (metadata.provider) enrichedLab.provider = metadata.provider;

        if (metadata.attributes) {
          const timeSlotsAttr = metadata.attributes.find(attr => attr.trait_type === 'timeSlots');
          if (timeSlotsAttr) enrichedLab.timeSlots = timeSlotsAttr.value;
          
          const docsAttr = metadata.attributes.find(attr => attr.trait_type === 'docs');
          if (docsAttr) enrichedLab.docs = docsAttr.value;
        }

        // Normalize images array: combine all available images
        const allImages = [];
        
        // Add main image first if exists
        if (metadata.image) allImages.push(metadata.image);
        
        // Add direct images array if exists
        if (metadata.images && Array.isArray(metadata.images)) {
          allImages.push(...metadata.images.filter(Boolean));
        }
        
        // Add additional images from attributes if exists
        if (metadata.attributes) {
          const additionalImagesAttr = metadata.attributes.find(attr => attr.trait_type === 'additionalImages');
          if (additionalImagesAttr?.value && Array.isArray(additionalImagesAttr.value)) {
            allImages.push(...additionalImagesAttr.value.filter(Boolean));
          }
        }
        
        // Remove duplicates and set as images array
        enrichedLab.images = [...new Set(allImages)];

        // Add image URLs mapped to this lab
        const labImages = labImageMap.get(index) || [];
        if (labImages.length > 0) {
          enrichedLab.imageUrls = labImages;
          // Set primary image if not already set
          if (!enrichedLab.image && labImages[0]) {
            enrichedLab.image = labImages[0];
          }
        }
      }

      // Fallbacks
      if (!enrichedLab.name) enrichedLab.name = `Lab ${enrichedLab.id}`;
      if (!enrichedLab.price) enrichedLab.price = '0';
      if (!enrichedLab.timeSlots || !Array.isArray(enrichedLab.timeSlots)) {
        enrichedLab.timeSlots = [15, 30, 60];
      }

      return enrichedLab;
    });

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
      metadataResults.forEach(r => r.refetch && r.refetch());
      imageResults.forEach(r => r.refetch && r.refetch());
    }
  };
};

// Module loaded confirmation
devLog.moduleLoaded('✅ Lab specialized hooks loaded');
