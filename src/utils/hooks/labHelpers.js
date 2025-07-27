/**
 * Lab Utility Functions
 * Helper functions for processing lab data
 */
import { formatUnits } from 'viem'
import devLog from '@/utils/dev/logger'

/**
 * Helper function to parse metadata attributes
 */
export function parseAttributes(attributes = []) {
  const result = {};
  for (const attr of attributes) {
    result[attr.trait_type] = attr.value;
  }
  return result;
}

/**
 * Helper function to convert price to human format
 */
export function convertPriceToHuman(priceString, decimals) {
  if (!priceString || priceString === '0') return 0;
  
  try {
    return parseFloat(formatUnits(BigInt(priceString), decimals));
  } catch (error) {
    devLog.error('Error converting price to human format:', error);
    return parseFloat(priceString);
  }
}

/**
 * Create provider lookup map from providers array
 */
export function createProviderMap(providers) {
  const providerMap = {};
  for (const provider of providers) {
    providerMap[provider.account.toLowerCase()] = provider.base.name;
  }
  return providerMap;
}

/**
 * Compose complete lab object from atomic data
 */
export function composeLabObject(labId, labData, owner, metadata, decimals, providerMap) {
  const attrs = parseAttributes(metadata.attributes);
  const providerName = providerMap[owner.toLowerCase()] || owner;

  return {
    id: labId,
    name: metadata?.name ?? `Lab ${labId}`,
    category: attrs?.category ?? "",
    keywords: attrs?.keywords ?? [],
    price: convertPriceToHuman(labData.base.price.toString(), decimals),
    description: metadata?.description ?? "No description available.",
    provider: providerName, 
    providerAddress: owner,
    auth: labData.base.auth?.toString() ?? "",
    accessURI: labData.base.accessURI?.toString() ?? "",
    accessKey: labData.base.accessKey?.toString() ?? "",
    timeSlots: attrs?.timeSlots ?? [60],
    opens: attrs?.opens ?? "",
    closes: attrs?.closes ?? "",
    docs: attrs?.docs ?? [],
    images: [metadata?.image, ...(attrs.additionalImages ?? [])].filter(Boolean),
    uri: labData.base.uri,
  };
}

/**
 * Create fallback lab object for failed requests
 */
export function createFallbackLab(labId, baseUri = '') {
  return {
    id: labId,
    name: `Lab ${labId}`,
    category: "",
    keywords: [],
    price: 0,
    description: "Lab data temporarily unavailable",
    provider: "Unknown",
    providerAddress: "",
    auth: "",
    accessURI: "",
    accessKey: "",
    timeSlots: [60],
    opens: "",
    closes: "",
    docs: [],
    images: [],
    uri: baseUri,
  };
}
