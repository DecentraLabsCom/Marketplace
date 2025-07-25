import devLog from '@/utils/logger';
import { getContractInstance } from '../../utils/contractInstance';

// Rate limiting and cache management
let rateLimitDetected = false;
let lastRateLimitTime = 0;
let consecutiveRateLimits = 0;
const RATE_LIMIT_COOLDOWN = 10000; // 10 seconds
const CACHE_DURATION = 30000; // 30 seconds cache
const EXTENDED_CACHE_DURATION = 300000; // 5 minutes extended cache

// Cache for lab reservations
const labReservationsCache = new Map();

// Helper function to check if error is rate limiting
function isRateLimitError(error) {
  const errorMsg = error.message?.toLowerCase() || '';
  return errorMsg.includes('rate limit') || 
         errorMsg.includes('too many requests') || 
         errorMsg.includes('429') ||
         errorMsg.includes('exceeded');
}

// Cache helpers
function getCacheKey(labId) {
  return `lab_reservations_${labId}`;
}

function isCacheValid(labId) {
  const cacheKey = getCacheKey(labId);
  const cached = labReservationsCache.get(cacheKey);
  return cached && (Date.now() - cached.timestamp) < CACHE_DURATION;
}

function getCache(labId) {
  const cacheKey = getCacheKey(labId);
  return labReservationsCache.get(cacheKey);
}

function setCache(labId, data) {
  const cacheKey = getCacheKey(labId);
  labReservationsCache.set(cacheKey, {
    data,
    timestamp: Date.now()
  });
}

// Main handler function
async function handleRequest(labId, clearCache = false) {
  const startTime = Date.now();
  const requestId = Math.random().toString(36).substr(2, 9);
  
  devLog.log(`[${requestId}] 🧪 getLabBookings request started`, {
    labId,
    clearCache,
    rateLimitDetected,
    timestamp: new Date().toISOString()
  });

  try {
    // Early rate limit check
    if (rateLimitDetected && (Date.now() - lastRateLimitTime < RATE_LIMIT_COOLDOWN)) {
      const remainingCooldown = RATE_LIMIT_COOLDOWN - (Date.now() - lastRateLimitTime);
      devLog.log(`[${requestId}] ⏱️ Rate limit cooldown active, waiting ${remainingCooldown}ms...`);
      await new Promise(resolve => setTimeout(resolve, remainingCooldown));
    }

    // Check cache first (skip if clearCache is true)
    if (!clearCache && isCacheValid(labId)) {
      devLog.log(`[${requestId}] ⚡ Cache HIT - serving from cache`);
      const cache = getCache(labId);
      const responseTime = Date.now() - startTime;
      
      return Response.json(cache.data, {
        status: 200,
        headers: {
          'X-Cache': 'HIT',
          'X-Request-ID': requestId,
          'X-Response-Time': `${responseTime}ms`
        }
      });
    }

    // Get contract instance
    let contract;
    try {
      contract = await getContractInstance();
    } catch (contractError) {
      devLog.error(`[${requestId}] ❌ Contract instance failed:`, contractError.message);
      throw new Error('RPC_UNAVAILABLE');
    }

    // Fetch lab reservations using getReservationsOfToken and getReservationOfTokenByIndex
    const blockchainStartTime = Date.now();
    let labReservationCount;
    
    try {
      devLog.log(`[${requestId}] 📡 Calling getReservationsOfToken for lab ${labId}...`);
      
      labReservationCount = await Promise.race([
        contract.getReservationsOfToken(labId),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('getReservationsOfToken timeout')), 15000)
        )
      ]);
      
      devLog.log(`[${requestId}] 📊 Lab ${labId} has ${labReservationCount?.toString() || 0} reservations`);

      // Reset rate limit flag on successful call
      if (rateLimitDetected) {
        devLog.log(`[${requestId}] ✅ Rate limit cleared`);
        rateLimitDetected = false;
        lastRateLimitTime = 0;
        consecutiveRateLimits = 0;
      }

    } catch (blockchainError) {
      devLog.warn(`[${requestId}] ⚠️ getReservationsOfToken failed:`, blockchainError.message);
      
      // Handle nonexistent lab (ERC721NonexistentToken)
      if (blockchainError.message?.includes('ERC721NonexistentToken')) {
        devLog.log(`[${requestId}] 🔍 Lab ${labId} does not exist, returning empty array`);
        const emptyResult = [];
        setCache(labId, emptyResult);
        
        const totalTime = Date.now() - startTime;
        return Response.json(emptyResult, {
          status: 200,
          headers: {
            'X-Cache': 'MISS',
            'X-Request-ID': requestId,
            'X-Response-Time': `${totalTime}ms`,
            'X-Lab-Status': 'nonexistent'
          }
        });
      }
      
      // Handle rate limiting
      if (isRateLimitError(blockchainError)) {
        rateLimitDetected = true;
        lastRateLimitTime = Date.now();
        consecutiveRateLimits++;
        
        devLog.warn(`[${requestId}] 🚫 Rate limit detected (count: ${consecutiveRateLimits})`);
        
        // Check for extended cache
        const extendedCache = getCache(labId);
        if (extendedCache && (Date.now() - extendedCache.timestamp < EXTENDED_CACHE_DURATION)) {
          devLog.log(`[${requestId}] 💾 Using extended cache due to rate limiting`);
          return Response.json(extendedCache.data, {
            status: 200,
            headers: {
              'X-Cache': 'EXTENDED-RATE-LIMITED',
              'X-Request-ID': requestId,
              'X-Response-Time': `${Date.now() - startTime}ms`
            }
          });
        }
        
        return Response.json({ 
          error: 'Rate limited - please try again in a few seconds',
          message: 'The blockchain network is currently rate limiting requests.',
          requestId,
          retryAfter: 5
        }, { 
          status: 429,
          headers: {
            'X-Request-ID': requestId,
            'X-Response-Time': `${Date.now() - startTime}ms`,
            'Retry-After': '5'
          }
        });
      }
      
      throw blockchainError;
    }

    // If no reservations, return empty array
    if (!labReservationCount || Number(labReservationCount) === 0) {
      const emptyResult = [];
      setCache(labId, emptyResult);
      
      const totalTime = Date.now() - startTime;
      devLog.log(`[${requestId}] ✅ No reservations found for lab ${labId} (${totalTime}ms)`);
      
      return Response.json(emptyResult, {
        status: 200,
        headers: {
          'X-Cache': 'MISS',
          'X-Request-ID': requestId,
          'X-Response-Time': `${totalTime}ms`
        }
      });
    }

    // Convert to number for iteration
    const reservationCount = Number(labReservationCount);
    
    // Fetch detailed reservation data for each lab reservation
    devLog.log(`[${requestId}] 🔍 Fetching detailed data for ${reservationCount} reservations...`);
    
    // Function to fetch single reservation with retries
    async function fetchReservationWithRetry(index, maxRetries = 3, baseDelay = 1000) {
      for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
          // Get reservation key by index for this lab
          const reservationKey = await Promise.race([
            contract.getReservationOfTokenByIndex(labId, index),
            new Promise((_, reject) => 
              setTimeout(() => reject(new Error(`Key fetch timeout for index ${index}`)), 3000)
            )
          ]);
          
          if (!reservationKey || reservationKey === '0x0000000000000000000000000000000000000000000000000000000000000000') {
            devLog.warn(`[${requestId}] ⚠️ Invalid reservation key for lab ${labId} index ${index}`);
            return null;
          }
          
          // Get detailed reservation data
          const reservation = await Promise.race([
            contract.getReservation(reservationKey),
            new Promise((_, reject) => 
              setTimeout(() => reject(new Error(`Reservation fetch timeout for key ${reservationKey}`)), 3000)
            )
          ]);
          
          if (!reservation) {
            devLog.warn(`[${requestId}] ⚠️ No reservation data for key ${reservationKey}`);
            return null;
          }
          
          const reservationResult = {
            reservationKey: reservationKey,
            labId: reservation.labId.toString(),
            renter: reservation.renter,
            price: reservation.price?.toString() || "0",
            start: reservation.start.toString(),
            end: reservation.end.toString(),
            status: reservation.status.toString(),
            date: new Date(parseInt(reservation.start) * 1000).toLocaleDateString('en-US'),
            id: index
          };

          // For single attempt (first try), return reservation data directly for speed
          if (maxRetries === 1) {
            return reservationResult;
          }
          
          // For retry attempts, return structured response
          return {
            success: true,
            data: reservationResult
          };
          
        } catch (error) {
          // For first attempt, let the error bubble up to be handled by Promise.allSettled
          if (maxRetries === 1) {
            throw error;
          }
          
          devLog.warn(`[${requestId}] Attempt ${attempt + 1} failed for lab ${labId} reservation index ${index}:`, error.message);
          
          if (attempt === maxRetries - 1) {
            // Final attempt failed
            devLog.error(`[${requestId}] All ${maxRetries} attempts failed for lab ${labId} reservation index ${index}:`, error);
            return {
              success: false,
              index: index,
              error: error.message,
              data: null
            };
          }
          
          // Wait before retry with exponential backoff
          const delay = baseDelay * Math.pow(2, attempt);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    // First attempt: batch process all reservations (optimized for speed)
    const initialResults = await Promise.allSettled(
      Array.from({ length: reservationCount }, async (_, index) => {
        return await fetchReservationWithRetry(index, 1); // Single attempt first
      })
    );

    // Quick check: if all succeeded, return immediately (same speed as before)
    const allSucceeded = initialResults.every(result => result.status === 'fulfilled' && result.value !== null);
    
    if (allSucceeded) {
      const validReservations = initialResults
        .map(result => result.value)
        .filter(res => res !== null);
      
      const blockchainTime = Date.now() - blockchainStartTime;
      
      // Cache the results and return immediately
      setCache(labId, validReservations);
      
      const totalTime = Date.now() - startTime;
      devLog.log(`[${requestId}] ✅ Request completed successfully (fast path):`, {
        labId,
        reservationsCount: validReservations.length,
        totalTime: `${totalTime}ms`,
        blockchainTime: `${blockchainTime}ms`
      });

      return Response.json(validReservations, {
        status: 200,
        headers: {
          'X-Cache': 'MISS',
          'X-Request-ID': requestId,
          'X-Response-Time': `${totalTime}ms`,
          'X-Blockchain-Time': `${blockchainTime}ms`
        }
      });
    }

    // If some failed, proceed with retry logic
    const successfulReservations = [];
    const failedIndices = [];

    initialResults.forEach((result, index) => {
      if (result.status === 'fulfilled' && result.value !== null) {
        successfulReservations.push(result.value);
      } else {
        failedIndices.push(index);
        if (result.status === 'rejected') {
          devLog.error(`[${requestId}] Lab ${labId} reservation index ${index} failed:`, result.reason?.message || result.reason);
        }
      }
    });

    devLog.log(`[${requestId}] Initial batch: ${successfulReservations.length} successful, ${failedIndices.length} failed`);

    // Retry failed reservations with more attempts and longer delays
    if (failedIndices.length > 0) {
      devLog.log(`[${requestId}] Retrying ${failedIndices.length} failed reservations...`);
      
      const retryResults = await Promise.allSettled(
        failedIndices.map(async (index) => {
          return await fetchReservationWithRetry(index, 3, 2000); // 3 attempts with 2s base delay
        })
      );

      // Process retry results
      retryResults.forEach((result, retryIndex) => {
        const originalIndex = failedIndices[retryIndex];
        
        if (result.status === 'fulfilled') {
          if (result.value && result.value.success && result.value.data) {
            successfulReservations.push(result.value.data);
            devLog.log(`[${requestId}] Successfully recovered lab ${labId} reservation index ${originalIndex} on retry`);
          } else if (result.value && !result.value.success) {
            devLog.error(`[${requestId}] Lab ${labId} reservation index ${originalIndex} failed after all retries: ${result.value.error}`);
            // Don't add failed reservations to the final result
          }
        } else {
          devLog.error(`[${requestId}] Complete failure for lab ${labId} reservation index ${originalIndex}:`, result.reason);
        }
      });
    }

    const validReservations = successfulReservations.filter(res => res !== null);
    
    const blockchainTime = Date.now() - blockchainStartTime;
    
    devLog.log(`[${requestId}] 📦 Processed reservations for lab ${labId}:`, {
      total: reservationCount,
      valid: validReservations.length,
      failed: reservationCount - validReservations.length,
      blockchainTime: `${blockchainTime}ms`
    });

    // Cache the results
    setCache(labId, validReservations);
    
    const totalTime = Date.now() - startTime;
    devLog.log(`[${requestId}] ✅ Request completed successfully:`, {
      labId,
      reservationsCount: validReservations.length,
      totalTime: `${totalTime}ms`,
      blockchainTime: `${blockchainTime}ms`
    });

    return Response.json(validReservations, {
      status: 200,
      headers: {
        'X-Cache': 'MISS',
        'X-Request-ID': requestId,
        'X-Response-Time': `${totalTime}ms`,
        'X-Blockchain-Time': `${blockchainTime}ms`
      }
    });

  } catch (error) {
    const totalTime = Date.now() - startTime;
    devLog.error(`[${requestId}] 💥 Request failed after ${totalTime}ms:`, error.message);

    // Check for extended cache during errors
    const extendedCache = getCache(labId);
    if (extendedCache && (Date.now() - extendedCache.timestamp < EXTENDED_CACHE_DURATION)) {
      devLog.log(`[${requestId}] 🔄 Using extended cache due to error`);
      return Response.json(extendedCache.data, {
        status: 200,
        headers: {
          'X-Cache': 'EXTENDED-ERROR',
          'X-Request-ID': requestId,
          'X-Response-Time': `${totalTime}ms`
        }
      });
    }

    return Response.json({ 
      error: 'Failed to fetch lab reservations',
      message: error.message,
      requestId 
    }, { 
      status: 500,
      headers: {
        'X-Request-ID': requestId,
        'X-Response-Time': `${totalTime}ms`
      }
    });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { labId, clearCache = false } = body;
    
    if (!labId) {
      return Response.json({ 
        error: 'Missing labId parameter' 
      }, { status: 400 });
    }

    // Validate labId format (should be a number or numeric string)
    const numericLabId = Number(labId);
    if (isNaN(numericLabId) || numericLabId < 0) {
      return Response.json({ 
        error: 'Invalid labId format - must be a valid positive number' 
      }, { status: 400 });
    }

    return await handleRequest(numericLabId, clearCache);
    
  } catch (error) {
    devLog.error('getLabBookings: Request parsing error:', error);
    return Response.json({ 
      error: 'Invalid request format',
      message: error.message 
    }, { status: 400 });
  }
}

export async function GET(request) {
  const url = new URL(request.url);
  const labId = url.searchParams.get('labId');
  const clearCache = url.searchParams.get('clearCache') === 'true';
  
  if (!labId) {
    return Response.json({ 
      error: 'Missing labId parameter' 
    }, { status: 400 });
  }

  // Validate labId format (should be a number or numeric string)
  const numericLabId = Number(labId);
  if (isNaN(numericLabId) || numericLabId < 0) {
    return Response.json({ 
      error: 'Invalid labId format - must be a valid positive number' 
    }, { status: 400 });
  }

  return await handleRequest(numericLabId, clearCache);
}
