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
    // Ensure priceString is defined and can be converted to BigInt
    if (priceString === undefined || priceString === null) {
      devLog.error('convertPriceToHuman: priceString is undefined or null', { priceString, decimals });
      return 0;
    }
    
    // Convert to string if not already
    const priceStr = priceString.toString();
    if (!priceStr || priceStr === 'undefined' || priceStr === 'null') {
      devLog.error('convertPriceToHuman: invalid price string', { priceString, priceStr, decimals });
      return 0;
    }
    
    return parseFloat(formatUnits(BigInt(priceStr), decimals));
  } catch (error) {
    devLog.error('Error converting price to human format:', error, { priceString, decimals });
    // Try to parse as regular float if BigInt conversion fails
    try {
      return parseFloat(priceString) || 0;
    } catch (parseError) {
      devLog.error('Failed to parse price as float:', parseError, { priceString });
      return 0;
    }
  }
}

/**
 * Create provider lookup map from providers array
 * Transforms array of provider objects into a keyed object for fast lookups
 * @param {Array} providers - Array of provider objects with address and metadata
 * @returns {Object} Map object where keys are provider addresses and values are provider data
 */
export function createProviderMap(providers) {
  const providerMap = {};
  
  if (!Array.isArray(providers)) {
    devLog.warn('createProviderMap: providers is not an array', providers);
    return providerMap;
  }
  
  for (const provider of providers) {
    // Validate provider structure
    if (!provider || typeof provider !== 'object') {
      devLog.warn('createProviderMap: invalid provider object', provider);
      continue;
    }
    
    // Handle different possible provider structures
    let account, name;
    
    if (provider.account && provider.base?.name) {
      // Original expected structure: { account: "0x...", base: { name: "..." } }
      account = provider.account;
      name = provider.base.name;
    } else if (typeof provider.account === 'string' && typeof provider.name === 'string') {
      // Alternative structure: { account: "0x...", name: "..." }
      account = provider.account;
      name = provider.name;
    } else if (Array.isArray(provider) && provider.length >= 2) {
      // Array structure: ["0x...", ["name", "email", "country"]] or ["0x...", "name"]
      account = provider[0];
      
      // Handle nested array for provider data: ["name", "email", "country"]
      if (Array.isArray(provider[1]) && provider[1].length > 0) {
        name = provider[1][0]; // Extract only the name, first element
      } else {
        name = provider[1]; // Simple string name
      }
    } else {
      devLog.warn('createProviderMap: unrecognized provider structure', provider);
      continue;
    }
    
    if (typeof account === 'string' && account.length > 0) {
      providerMap[account.toLowerCase()] = name || account;
    } else {
      devLog.warn('createProviderMap: invalid account in provider', provider);
    }
  }
  
  return providerMap;
}

/**
 * Compose complete lab object from atomic data pieces
 * Combines lab contract data, metadata, owner info, and provider mapping into a unified lab object
 * @param {string|number} labId - Unique lab identifier
 * @param {Object} labData - Raw lab data from smart contract
 * @param {string} owner - Lab owner's wallet address
 * @param {Object} metadata - Lab metadata object with attributes
 * @param {number} decimals - Token decimals for price conversion
 * @param {Object} providerMap - Provider address to name mapping
 * @returns {Object} Complete lab object with all properties normalized and accessible
 */
export function composeLabObject(labId, labData, owner, metadata, decimals, providerMap) {
  const attrs = parseAttributes(metadata.attributes);
  const providerName = providerMap[owner.toLowerCase()] || owner;

  // Safely extract price with better error handling
  let priceValue = 0;
  try {
    const basePrice = labData?.base?.price;
    if (basePrice !== undefined && basePrice !== null) {
      priceValue = convertPriceToHuman(basePrice.toString(), decimals);
    } else {
      devLog.warn('composeLabObject: base price is undefined', { labId, labData });
    }
  } catch (error) {
    devLog.error('composeLabObject: error processing price', error, { labId, labData });
  }

  return {
    id: labId,
    name: metadata?.name ?? `Lab ${labId}`,
    category: attrs?.category ?? "",
    keywords: attrs?.keywords ?? [],
    price: priceValue,
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
 * Provides a minimal lab object when primary data sources fail
 * @param {string|number} labId - Lab identifier to create fallback for
 * @param {string} baseUri - Optional base URI for the lab (defaults to empty string)
 * @returns {Object} Minimal lab object with safe default values
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
