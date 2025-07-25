import devLog from '@/utils/logger';

// Optimized API route with server-side caching and batch operations
import fs from 'fs/promises';
import path from 'path';
import pLimit from 'p-limit';
import { formatUnits } from 'viem';
import { simLabsData } from '@/utils/simLabsData';
import { getContractInstance } from '../../utils/contractInstance';
import { contractAddressesLAB, labTokenABI } from '@/contracts/lab';
import getIsVercel from '@/utils/isVercel';

// Server-side cache with TTL (15 minutes - increased to reduce API calls)
let labsCache = null;
let cacheTimestamp = 0;
const CACHE_TTL = 15 * 60 * 1000; // 15 minutes

// Cache for LAB token decimals
let labTokenDecimals = null;

// Function to get LAB token decimals
async function getLabTokenDecimals() {
  if (labTokenDecimals !== null) {
    return labTokenDecimals;
  }
  
  try {
    const contract = await getContractInstance();
    const chainName = contract.runner?.provider?.network?.name?.toLowerCase() || 'localhost';
    const labTokenAddress = contractAddressesLAB[chainName];
    
    if (!labTokenAddress) {
      devLog.warn('LAB token address not found for chain:', chainName);
      return 6; // Default to 6 decimals for LAB token
    }
    
    // Create LAB token contract instance
    const labTokenContract = new contract.constructor(labTokenAddress, labTokenABI, contract.runner);
    
    // Direct call with timeout
    labTokenDecimals = await Promise.race([
      labTokenContract.decimals(),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('decimals() timeout')), 5000)
      )
    ]);
    
    return labTokenDecimals;
  } catch (error) {
    devLog.error('Error getting LAB token decimals:', error);
    return 6; // Default to 6 decimals for LAB token if error
  }
}

// Function to convert price from token units to human format
// Keep price per second as stored in contract, UI will handle per hour conversion
function convertPriceToHuman(priceString, decimals) {
  if (!priceString || priceString === '0') return 0;
  
  try {
    // Convert from wei to decimal format (per second, as stored in contract)
    return parseFloat(formatUnits(BigInt(priceString), decimals));
  } catch (error) {
    devLog.error('Error converting price to human format:', error);
    return parseFloat(priceString); // Fallback to original value
  }
}

export async function GET() {
  // Check server-side cache first
  const now = Date.now();
  if (labsCache && (now - cacheTimestamp) < CACHE_TTL) {
    devLog.log('Returning cached labs data');
    return Response.json(labsCache, { 
      status: 200,
      headers: {
        'Cache-Control': 'public, max-age=900', // 15 minutes browser cache
      }
    });
  }

  function parseAttributes(attributes = []) {
    const result = {};
    for (const attr of attributes) {
      result[attr.trait_type] = attr.value;
    }
    return result;
  }

  try {
    const isVercel = getIsVercel();
    const contract = await getContractInstance();

    // Get LAB token decimals for price conversion
    const decimals = await getLabTokenDecimals();

    // Batch contract calls for better performance
    const [providerList, labIds] = await Promise.all([
      Promise.race([
        contract.getLabProviders(),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('getLabProviders timeout')), 15000)
        )
      ]),
      Promise.race([
        contract.getAllLabs(),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('getAllLabs timeout')), 15000)
        )
      ])
    ]);

    // Create provider map
    const providerMap = {};
    for (const provider of providerList) {
      providerMap[provider.account.toLowerCase()] = provider.base.name;
    }

    // Each lab makes 2 contract calls (getLab + ownerOf)
    const limit = pLimit(4);

    // Function to fetch single lab with retries
    async function fetchLabWithRetry(labId, maxRetries = 3, baseDelay = 1000) {
      for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
          // Parallelize contract calls
          const [labData, providerAddress] = await Promise.all([
            Promise.race([
              contract.getLab(labId),
              new Promise((_, reject) => 
                setTimeout(() => reject(new Error(`getLab timeout for ${labId}`)), 12000)
              )
            ]),
            Promise.race([
              contract.ownerOf(labId),
              new Promise((_, reject) => 
                setTimeout(() => reject(new Error(`ownerOf timeout for ${labId}`)), 12000)
              )
            ]),
          ]);

          // Optimized metadata fetching with fallbacks
          let metadata = await fetchMetadataOptimized(labData.base.uri, labId, isVercel);

          // Parse attributes
          const attrs = parseAttributes(metadata.attributes);
          const providerName = providerMap[providerAddress.toLowerCase()] || providerAddress;

          // Return lab data directly for first attempt, structured response for retries
          const labResult = {
            id: labId,
            name: metadata?.name ?? `Lab ${labId}`,
            category: attrs?.category ?? "",
            keywords: attrs?.keywords ?? [],
            price: convertPriceToHuman(labData.base.price.toString(), decimals),
            description: metadata?.description ?? "No description available.",
            provider: providerName, 
            providerAddress: providerAddress,
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

          // For single attempt (first try), return lab data directly for speed
          if (maxRetries === 1) {
            return labResult;
          }
          
          // For retry attempts, return structured response
          return {
            success: true,
            data: labResult
          };
        } catch (error) {
          // For first attempt, let the error bubble up to be handled by Promise.allSettled
          if (maxRetries === 1) {
            throw error;
          }
          
          devLog.warn(`Attempt ${attempt + 1} failed for lab ${labId}:`, error.message);
          
          if (attempt === maxRetries - 1) {
            // Final attempt failed
            devLog.error(`All ${maxRetries} attempts failed for lab ${labId}:`, error);
            return {
              success: false,
              labId: labId,
              error: error.message,
              data: {
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
                uri: "",
              }
            };
          }
          
          // Wait before retry with exponential backoff
          const delay = baseDelay * Math.pow(2, attempt);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    // First attempt: batch process all labs (optimized for speed)
    const initialResults = await Promise.allSettled(
      labIds.map(async (labIdRaw) =>
        limit(async () => {
          const labId = labIdRaw.toString();
          return await fetchLabWithRetry(labId, 1); // Single attempt first
        })
      )
    );

    // Quick check: if all succeeded, return immediately (same speed as before)
    const allSucceeded = initialResults.every(result => result.status === 'fulfilled');
    
    if (allSucceeded) {
      const successfulLabs = initialResults.map(result => result.value);
      
      // Update cache and return immediately
      labsCache = successfulLabs;
      cacheTimestamp = now;
      
      return Response.json(successfulLabs, { 
        status: 200,
        headers: {
          'Cache-Control': 'public, max-age=300',
        }
      });
    }

    // If some failed, proceed with retry logic
    devLog.log(`Processing ${labIds.length} labs with retry mechanism - ${initialResults.filter(r => r.status === 'rejected').length} failed`);
    
    // Separate successful and failed results
    const successfulLabs = [];
    const failedLabIds = [];

    initialResults.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        successfulLabs.push(result.value);
      } else {
        const labId = labIds[index].toString();
        failedLabIds.push(labId);
        devLog.error(`Lab ${labId} failed:`, result.reason?.message || result.reason);
      }
    });

    devLog.log(`Initial batch: ${successfulLabs.length} successful, ${failedLabIds.length} failed`);

    // Retry failed labs with more attempts and longer delays
    if (failedLabIds.length > 0) {
      devLog.log(`Retrying ${failedLabIds.length} failed labs...`);
      
      const retryResults = await Promise.allSettled(
        failedLabIds.map(async (labId) =>
          limit(async () => {
            return await fetchLabWithRetry(labId, 3, 2000); // 3 attempts with 2s base delay
          })
        )
      );

      // Process retry results
      retryResults.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          if (result.value.success) {
            successfulLabs.push(result.value.data);
            devLog.log(`Successfully recovered lab ${result.value.data.id} on retry`);
          } else {
            // Still failed after retries, add fallback data
            successfulLabs.push(result.value.data);
            devLog.error(`Lab ${result.value.labId} failed after all retries: ${result.value.error}`);
          }
        } else {
          // Final fallback for completely failed promises
          const labId = failedLabIds[index];
          successfulLabs.push({
            id: labId,
            name: `Lab ${labId}`,
            category: "",
            keywords: [],
            price: 0,
            description: "Lab data unavailable after retries",
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
            uri: "",
          });
          devLog.error(`Complete failure for lab ${labId}:`, result.reason);
        }
      });
    }

    devLog.log(`Final results: ${successfulLabs.length} labs processed successfully`);

    // Update cache
    labsCache = successfulLabs;
    cacheTimestamp = now;

    return Response.json(successfulLabs, { 
      status: 200,
      headers: {
        'Cache-Control': 'public, max-age=300', // 5 minutes browser cache
      }
    });

  } catch (error) {
    devLog.error('Error fetching labs metadata:', error);
    
    // Check if it's a rate limiting error (429)
    if (error.message.includes('429') || error.message.includes('Too Many Requests')) {
      devLog.log('Rate limit hit, returning cached data if available or fallback');
      
      // If we have cached data, return it even if expired
      if (labsCache) {
        devLog.log('Returning expired cached data due to rate limiting');
        return Response.json(labsCache, { 
          status: 200,
          headers: {
            'Cache-Control': 'public, max-age=60', // Short cache due to rate limiting
            'X-Rate-Limited': 'true'
          }
        });
      }
    }
    
    try {
      const fallbackLabs = simLabsData();
      devLog.log('Using simulation data as fallback');
      return Response.json(fallbackLabs, { 
        status: 200,
        headers: {
          'X-Fallback-Data': 'true'
        }
      });
    } catch (fallbackError) {
      devLog.error('Error fetching fallback labs data:', fallbackError);
      return new Response(JSON.stringify({ 
        error: 'Service temporarily unavailable due to rate limiting',
        message: 'Please try again in a few minutes'
      }), { 
        status: 503,
        headers: {
          'Retry-After': '300' // 5 minutes
        }
      });
    }
  }
}

// Optimized metadata fetching with timeout and caching
async function fetchMetadataOptimized(uri, labId, isVercel, timeout = 5000) {
  const defaultMetadata = {
    name: `Lab ${labId}`,
    description: "Metadata not available",
    attributes: []
  };

  try {
    if (uri.startsWith('Lab-')) {
      if (!isVercel) {
        const filePath = path.join(process.cwd(), 'data', uri);
        const fileContent = await fs.readFile(filePath, 'utf-8');
        return JSON.parse(fileContent);
      } else {
        const blobUrl = path.join(process.env.NEXT_PUBLIC_VERCEL_BLOB_BASE_URL, 'data', uri);
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);
        
        try {
          const response = await fetch(blobUrl, { 
            signal: controller.signal,
            headers: { 'Cache-Control': 'max-age=3600' } // 1 hour cache
          });
          clearTimeout(timeoutId);
          
          if (response.ok) {
            return await response.json();
          }
        } catch (error) {
          clearTimeout(timeoutId);
          throw error;
        }
      }
    } else {
      // External URI with timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);
      
      try {
        const response = await fetch(uri, { 
          signal: controller.signal,
          headers: { 'Cache-Control': 'max-age=3600' }
        });
        clearTimeout(timeoutId);
        
        if (response.ok) {
          return await response.json();
        }
      } catch (error) {
        clearTimeout(timeoutId);
        throw error;
      }
    }
  } catch (error) {
    devLog.error(`Failed to fetch metadata for ${uri}:`, error.message);
  }

  return defaultMetadata;
}
