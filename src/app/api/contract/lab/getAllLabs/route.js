// Optimized API route with server-side caching and batch operations
import fs from 'fs/promises';
import path from 'path';
import pLimit from 'p-limit';
import { simLabsData } from '@/utils/simLabsData';
import { getContractInstance } from '../../utils/contractInstance';
import retry from '@/utils/retry';
import getIsVercel from '@/utils/isVercel';

// Server-side cache with TTL (5 minutes)
let labsCache = null;
let cacheTimestamp = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export async function GET(request) {
  // Check server-side cache first
  const now = Date.now();
  if (labsCache && (now - cacheTimestamp) < CACHE_TTL) {
    console.log('Returning cached labs data');
    return Response.json(labsCache, { 
      status: 200,
      headers: {
        'Cache-Control': 'public, max-age=300', // 5 minutes browser cache
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
            console.error(`Error processing lab ${labId}:`, error);
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
      console.warn(`Failed to fetch ${failedLabs.length} labs`);
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
    console.error('Error fetching labs metadata:', error);
    try {
      const fallbackLabs = simLabsData();
      return Response.json(fallbackLabs, { status: 200 });
    } catch (fallbackError) {
      console.error('Error fetching fallback labs data:', fallbackError);
      return new Response(JSON.stringify({ error: 'Failed to fetch labs metadata and fallback data' }),
        { status: 500 });
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
    console.error(`Failed to fetch metadata for ${uri}:`, error.message);
  }

  return defaultMetadata;
}