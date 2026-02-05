const EMPTY_ARRAY = [];

/**
 * Helper function to format wallet address for display
 */
export const formatWalletAddress = (address) => {
  if (!address || address.length < 7) return address;
  return `${address.substring(0, 3)}...${address.substring(address.length - 3)}`;
};

export const extractProviderFromUri = (uri) => {
  if (!uri || typeof uri !== 'string') return null;
  const match = uri.match(/Lab-([A-Za-z0-9-]+)-\d+/);
  if (!match) return null;
  const provider = match[1].replace(/-/g, ' ').trim();
  return provider || match[1];
};

export const buildAttributeMap = (metadata) => {
  if (!metadata?.attributes) return {}
  return metadata.attributes.reduce((acc, attr) => {
    if (attr?.trait_type) {
      acc[attr.trait_type] = attr.value
    }
    return acc
  }, {})
}

export const applyMetadataAttributes = (lab, metadata) => {
  if (!metadata) return {}
  const attributeMap = buildAttributeMap(metadata)

  if (attributeMap.category !== undefined) lab.category = attributeMap.category
  if (attributeMap.keywords !== undefined) lab.keywords = attributeMap.keywords
  if (attributeMap.timeSlots !== undefined) lab.timeSlots = attributeMap.timeSlots
  if (attributeMap.opens !== undefined) lab.opens = attributeMap.opens
  if (attributeMap.closes !== undefined) lab.closes = attributeMap.closes
  if (attributeMap.docs !== undefined) lab.docs = attributeMap.docs
  if (attributeMap.availableDays !== undefined) lab.availableDays = attributeMap.availableDays
  if (attributeMap.availableHours !== undefined) lab.availableHours = attributeMap.availableHours
  if (attributeMap.maxConcurrentUsers !== undefined) lab.maxConcurrentUsers = attributeMap.maxConcurrentUsers
  if (attributeMap.unavailableWindows !== undefined) lab.unavailableWindows = attributeMap.unavailableWindows
  if (attributeMap.termsOfUse !== undefined) lab.termsOfUse = attributeMap.termsOfUse
  if (attributeMap.timezone !== undefined) lab.timezone = attributeMap.timezone

  return attributeMap
}

/**
 * Extract and normalize timeSlots from metadata attributes
 * Accepts arrays, comma-separated strings, or single numeric values
 * Returns normalized array of positive integers or the provided fallback
 */
export const getTimeSlotsFromMetadata = (metadata, fallback = [15, 30, 60]) => {
  if (!metadata) return fallback;
  const attributeMap = buildAttributeMap(metadata);
  if (attributeMap.timeSlots === undefined || attributeMap.timeSlots === null) return fallback;

  const raw = attributeMap.timeSlots;
  const arr = Array.isArray(raw) ? raw : (typeof raw === 'string' ? raw.split(',') : [raw]);
  const normalized = arr.map(Number).filter(n => Number.isFinite(n) && n > 0);
  return normalized.length > 0 ? normalized : fallback;
}

export const collectMetadataImages = (metadata) => {
  if (!metadata) return EMPTY_ARRAY;

  const images = [];

  // Extract main image
  if (metadata.image) images.push(metadata.image);

  // Extract additional images from images array
  if (metadata.images && Array.isArray(metadata.images)) {
    images.push(...metadata.images.filter(Boolean));
  }

  // Extract images from attributes
  if (metadata.attributes) {
    const attributeMap = buildAttributeMap(metadata);
    const additionalImagesAttr = attributeMap.additionalImages;
    if (Array.isArray(additionalImagesAttr)) {
      images.push(...additionalImagesAttr.filter(Boolean));
    }
  }

  return [...new Set(images)];
};

export const buildEnrichedLab = ({
  lab,
  metadata,
  images,
  imageUrls,
  isListed,
  reputation,
  ownerAddress,
  providerMapping,
  includeOwner = false,
  includeProviderInfo = false,
  includeProviderFallback = false,
  useMetadataProvider = false,
  providerInfoSelector,
  fallbackProviderLabel = 'Unknown Provider',
  descriptionFallback,
  ensureNonEmptyTimeSlots = false
}) => {
  if (!lab) return null;

  const enrichedLab = {
    id: lab.labId,
    labId: lab.labId,
    tokenId: lab.labId,
    ...lab.base,
  };

  if (isListed !== undefined) {
    enrichedLab.isListed = isListed;
  }

  if (reputation) {
    enrichedLab.reputation = reputation;
  }

  if (includeOwner && ownerAddress) {
    enrichedLab.owner = ownerAddress;
  }

  if (metadata) {
    if (metadata.name) enrichedLab.name = metadata.name;
    if (metadata.description) enrichedLab.description = metadata.description;
    if (metadata.image) enrichedLab.image = metadata.image;
    if (metadata.category) enrichedLab.category = metadata.category;
    if (metadata.keywords) enrichedLab.keywords = metadata.keywords;
    if (useMetadataProvider && metadata.provider) enrichedLab.provider = metadata.provider;

    applyMetadataAttributes(enrichedLab, metadata);
  }

  const hasImagesInput = images !== undefined || metadata;
  const resolvedImages = images !== undefined ? images : collectMetadataImages(metadata);
  if (hasImagesInput) {
    enrichedLab.images = resolvedImages;

    if (!enrichedLab.image && resolvedImages[0]) {
      enrichedLab.image = resolvedImages[0];
    }
  }

  if (imageUrls && imageUrls.length > 0) {
    enrichedLab.imageUrls = imageUrls;
    if (!enrichedLab.image && imageUrls[0]) {
      enrichedLab.image = imageUrls[0];
    }
  }

  if (includeProviderInfo && ownerAddress) {
    const providerInfo = providerMapping?.mapOwnerToProvider?.(ownerAddress);

    if (providerInfo) {
      enrichedLab.provider = providerInfo.name;
      enrichedLab.providerInfo = providerInfoSelector
        ? providerInfoSelector(providerInfo)
        : providerInfo;
    } else {
      // Provider not found - use formatted wallet address as fallback
      enrichedLab.provider = formatWalletAddress(ownerAddress);
    }
  }

  if (includeProviderFallback && !enrichedLab.provider) {
    const providerFromUri = extractProviderFromUri(lab.base?.uri);
    enrichedLab.provider = providerFromUri || fallbackProviderLabel;
  }

  if (!enrichedLab.name) enrichedLab.name = `Lab ${enrichedLab.id}`;
  if (!enrichedLab.price) enrichedLab.price = '0';
  if (descriptionFallback && !enrichedLab.description) {
    enrichedLab.description = descriptionFallback;
  }

  const timeSlots = enrichedLab.timeSlots;
  const hasTimeSlotsArray = Array.isArray(timeSlots);
  if (!hasTimeSlotsArray || (ensureNonEmptyTimeSlots && timeSlots.length === 0)) {
    enrichedLab.timeSlots = getTimeSlotsFromMetadata(metadata);
  }

  return enrichedLab;
};
