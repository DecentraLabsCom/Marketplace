import devLog from '@/utils/logger';

// Optimized API route with server-side caching and batch operations
import fs from 'fs/promises';
import path from 'path';
import pLimit from 'p-limit';
import { simLabsData } from '@/utils/simLabsData';
import { getContractInstance } from '../../utils/contractInstance';
import retry from '@/utils/retry';
import getIsVercel from '@/utils/isVercel';

// Server-side cache with TTL (15 minutes - increased to reduce API calls)
let labsCache = null;
let cacheTimestamp = 0;
const CACHE_TTL = 15 * 60 * 1000; // 15 minutes

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

    // Batch contract calls for better performance
    const [providerList, labIds] = await Promise.all([
      retry(() => contract.getLabProviders()),
      retry(() => contract.getAllLabs())
    ]);

    // Create provider map
    const providerMap = {};
    for (const provider of providerList) {
      providerMap[provider.account.toLowerCase()] = provider.base.name;
    }

    // Each lab makes 2 contract calls (getLab + ownerOf)
    const limit = pLimit(4);

    // Batch process labs with better error handling
    const labs = await Promise.allSettled(
      labIds.map(async (labIdRaw) =>
        limit(async () => {
          const labId = labIdRaw.toString();

          try {
            // Parallelize contract calls
            const [labData, providerAddress] = await Promise.all([
              retry(() => contract.getLab(labId)),
              retry(() => contract.ownerOf(labId)),
            ]);

            // Optimized metadata fetching with fallbacks
            let metadata = await fetchMetadataOptimized(labData.base.uri, labId, isVercel);

            // Parse attributes
            const attrs = parseAttributes(metadata.attributes);
            const providerName = providerMap[providerAddress.toLowerCase()] || providerAddress;

            return {
              id: labId,
              name: metadata?.name ?? `Lab ${labId}`,
              category: attrs?.category ?? "",
              keywords: attrs?.keywords ?? [],
              price: parseFloat(labData.base.price),
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
          } catch (error) {
            devLog.error(`Error processing lab ${labId}:`, error);
            // Return minimal lab data on error
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
              uri: "",
            };
          }
        })
      )
    );

    // Filter successful results
    const successfulLabs = labs
      .filter(result => result.status === 'fulfilled')
      .map(result => result.value);

    // Log failed labs for monitoring
    const failedLabs = labs.filter(result => result.status === 'rejected');
    if (failedLabs.length > 0) {
      devLog.warn(`Failed to fetch ${failedLabs.length} labs`);
    }

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
