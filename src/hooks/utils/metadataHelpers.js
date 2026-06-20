/**
 * Shared metadata helpers for booking and lab hooks.
 * Keep logic consistent across composed/specialized hooks.
 */

const normalizeList = (value) => {
  if (Array.isArray(value)) return value.filter(Boolean);
  return value ? [value] : [];
};

const uniqueList = (values) => [...new Set(values.filter(Boolean))];

const getAttributeValue = (metadataData, traitType) => (
  metadataData?.attributes?.find((attr) => attr.trait_type === traitType)?.value
);

export const processMetadataImages = (metadataData) => {
  if (!metadataData) return [];

  return uniqueList([
    ...normalizeList(metadataData.image),
    ...normalizeList(metadataData.images),
    ...normalizeList(getAttributeValue(metadataData, 'additionalImages')),
  ]);
};

export const processMetadataDocs = (metadataData) => {
  if (!metadataData) return [];

  return uniqueList([
    ...normalizeList(metadataData.docs),
    ...normalizeList(getAttributeValue(metadataData, 'docs')),
  ]);
};
