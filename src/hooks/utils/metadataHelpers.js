/**
 * Shared metadata helpers for booking and lab hooks.
 * Keep logic consistent across composed/specialized hooks.
 */

export const processMetadataImages = (metadataData) => {
  if (!metadataData?.attributes) return [];

  const imagesAttribute = metadataData.attributes.find(
    (attr) => attr.trait_type === 'additionalImages'
  );

  const images = imagesAttribute?.value || [];
  const normalized = Array.isArray(images) ? images : [];

  // Add main image if it exists and not already in images array
  if (metadataData.image && !normalized.includes(metadataData.image)) {
    normalized.unshift(metadataData.image);
  }

  return normalized;
};

export const processMetadataDocs = (metadataData) => {
  if (!metadataData?.attributes) return [];

  const docsAttribute = metadataData.attributes.find(
    (attr) => attr.trait_type === 'docs'
  );

  const docs = docsAttribute?.value || [];
  return Array.isArray(docs) ? docs : [];
};
