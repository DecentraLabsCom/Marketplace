import { getCache, setCache, isCacheValid } from '../cache';
import { getContractInstance } from '../../utils/contractInstance';
import { simBookings } from '@/utils/simBookings';
import devLog from '@/utils/logger';

// Extended cache for RPC failure scenarios  
let extendedCache = null;
let extendedCacheTimestamp = null;
const EXTENDED_CACHE_DURATION = 300000; // 5 minutes during RPC issues
const EMERGENCY_CACHE_DURATION = 900000; // 15 minutes for severe rate limiting

// Rate limiting detection and backoff
let rateLimitDetected = false;
let lastRateLimitTime = 0;
const RATE_LIMIT_COOLDOWN = 10000; // 10 seconds cooldown after rate limit detection
let consecutiveRateLimits = 0; // Track consecutive rate limit occurrences

export async function GET(request) {
  // Support GET requests for fetching all bookings
  const url = new URL(request.url);
  const clearCache = url.searchParams.get('clearCache') === 'true';
  return handleRequest(null, clearCache);
}

export async function POST(request) {
  const body = await request.json();
  const { wallet } = body;
  const url = new URL(request.url);
  const clearCache = url.searchParams.get('clearCache') === 'true';
  return handleRequest(wallet, clearCache);
}

// Helper function to detect rate limiting errors
function isRateLimitError(error) {
  const errorMessage = error.message ? error.message.toLowerCase() : '';
  const errorCode = error.code;
  
  return (
    errorMessage.includes('429') ||
    errorMessage.includes('rate limit') ||
    errorMessage.includes('rps limit') ||
    errorMessage.includes('15/second request limit') ||
    errorMessage.includes('try_again_in') ||
    errorMessage.includes('unexpected server response: 429') ||
    errorCode === -32005 ||
    errorCode === -32007 ||
    errorCode === 429
  );
}

// Helper to determine if we should use emergency cache
function shouldUseEmergencyCache() {
  return rateLimitDetected && 
         consecutiveRateLimits >= 3 && 
         extendedCache && 
         (Date.now() - extendedCacheTimestamp < EMERGENCY_CACHE_DURATION);
}

// Helper function to calculate if a reservation is in a relevant time window
function isReservationRelevant(reservation) {
  const now = Date.now() / 1000; // Unix timestamp in seconds
  const end = parseInt(reservation.end);
  
  // Include reservations that:
  // 1. Are currently active (started but not ended)
  // 2. Will start in the future
  // 3. Ended within the last 90 days (for extended history in user/provider dashboards)
  const ninetyDaysAgo = now - (90 * 24 * 60 * 60);
  
  return end >= ninetyDaysAgo; // Keep recent and future reservations
}

// Efficient batch fetcher that gets reservations individually
async function fetchReservationsIndividually(contract, requestId) {
  const blockchainStartTime = Date.now();
  
  try {
    // Step 1: Get total count of reservations with enhanced debugging
    devLog.log(`[${requestId}] 📊 Getting total reservations count...`);
        
    // Call totalReservations with rate limit detection
    let totalReservationsResult;
    try {
      devLog.log(`[${requestId}] 🔄 Attempting direct call to totalReservations()...`);
      
      // Add timeout to individual calls to prevent hanging
      totalReservationsResult = await Promise.race([
        contract.totalReservations(),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('totalReservations timeout')), 8000) // 8 second timeout
        )
      ]);
      
      devLog.log(`[${requestId}] 📥 Direct call result:`, {
        result: totalReservationsResult,
        type: typeof totalReservationsResult,
        constructor: totalReservationsResult?.constructor?.name
      });
      
      // Reset rate limit flag on successful call
      if (rateLimitDetected) {
        devLog.log(`[${requestId}] ✅ Rate limit cleared, resuming normal operation`);
        rateLimitDetected = false;
        lastRateLimitTime = 0;
        consecutiveRateLimits = 0; // Reset counter on success
      }
      
    } catch (directError) {
      devLog.error(`[${requestId}] ❌ Direct call failed:`, directError.message);
      
      // Check if this is a rate limiting error
      if (isRateLimitError(directError)) {
        rateLimitDetected = true;
        lastRateLimitTime = Date.now();
        consecutiveRateLimits++;
        devLog.warn(`[${requestId}] ⚠️ Rate limit detected (count: ${consecutiveRateLimits}), using fallback strategy`);
        
        // Check for emergency cache first (older cache for severe rate limiting)
        if (shouldUseEmergencyCache()) {
          devLog.log(`[${requestId}] 🆘 Using emergency cache due to persistent rate limiting`);
          throw new Error('RATE_LIMITED_USE_CACHE');
        }
        
        // For rate limiting, immediately use cached data if available
        const hasValidCache = extendedCache && (Date.now() - extendedCacheTimestamp < EXTENDED_CACHE_DURATION);
        if (hasValidCache) {
          devLog.log(`[${requestId}] 💾 Using extended cache due to rate limiting`);
          throw new Error('RATE_LIMITED_USE_CACHE');
        }
        
        // If no cache, implement a single backoff delay and try once more
        const backoffDelay = Math.min(3000 + (consecutiveRateLimits * 1000), 8000); // Reduced progressive backoff
        devLog.log(`[${requestId}] ⏱️ Waiting ${backoffDelay}ms before single retry...`);
        await new Promise(resolve => setTimeout(resolve, backoffDelay));
        
        try {
          devLog.log(`[${requestId}] 🔄 Single retry attempt with timeout...`);
          totalReservationsResult = await Promise.race([
            contract.totalReservations(),
            new Promise((_, reject) => 
              setTimeout(() => reject(new Error('totalReservations retry timeout')), 5000) // 5 second timeout for retry
            )
          ]);
          devLog.log(`[${requestId}] ✅ Retry successful`);
          
          // Reset rate limit counters on successful retry
          rateLimitDetected = false;
          lastRateLimitTime = 0;
          consecutiveRateLimits = 0;
          
        } catch (retryError) {
          devLog.error(`[${requestId}] ❌ Retry failed:`, retryError.message);
          // Use fallback logic instead of continuing to retry
          totalReservationsResult = undefined;
        }
      } else {
        devLog.log(`[${requestId}] ⏭️ Skipping retry - not a rate limit error`);
        // Reset consecutive rate limits on non-rate-limit errors
        consecutiveRateLimits = 0;
        throw directError; // Throw non-rate-limit errors
      }
    }
    
    devLog.log(`[${requestId}] 🔍 Raw totalReservations result:`, {
      result: totalReservationsResult,
      type: typeof totalReservationsResult,
      numberValue: totalReservationsResult ? Number(totalReservationsResult) : 'N/A'
    });
    
    // Handle different types of responses
    let totalCount = 0;
    if (typeof totalReservationsResult === 'bigint') {
      totalCount = Number(totalReservationsResult);
    } else if (totalReservationsResult === undefined || totalReservationsResult === null) {
      // Don't cache undefined/null results from rate limiting - they're not real data
      devLog.warn(`[${requestId}] ⚠️ totalReservations returned undefined/null - likely rate limited`);
      if (rateLimitDetected) {
        devLog.warn(`[${requestId}] 🚫 Rate limit active - not caching empty results`);
        throw new Error('RATE_LIMITED_NO_CACHE');
      }
      totalCount = 0;
    } else {
      devLog.warn(`[${requestId}] ⚠️ Unexpected totalReservations type:`, {
        type: typeof totalReservationsResult,
        value: totalReservationsResult
      });
      totalCount = 0;
    }
    
    devLog.log(`[${requestId}] 📋 Total reservations in contract: ${totalCount} (Expected from Etherscan: 81)`);
    
    // Step 2: Get reservation keys in batches to avoid overwhelming RPC
    const BATCH_SIZE = 15; // Increased batch size for better performance
    const allReservations = [];
    
    for (let i = 0; i < totalCount; i += BATCH_SIZE) {
      const batchEnd = Math.min(i + BATCH_SIZE, totalCount);
      devLog.log(`[${requestId}] 🔄 Processing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(totalCount / BATCH_SIZE)} (${i}-${batchEnd - 1})`);
      
      try {
        // Get reservation keys for this batch with timeout
        const keyPromises = [];
        for (let j = i; j < batchEnd; j++) {
          keyPromises.push(
            Promise.race([
              contract.reservationKeyByIndex(j),
              new Promise((_, reject) => 
                setTimeout(() => reject(new Error(`Key fetch timeout at index ${j}`)), 3000) // 3 second timeout per key
              )
            ])
              .then(result => {
                return result;
              })
              .catch(error => {
                devLog.warn(`[${requestId}] ⚠️ Failed to get reservation key at index ${j}:`, error.message);
                return null;
              })
          );
        }
        
        const reservationKeys = await Promise.all(keyPromises);
        const validKeys = reservationKeys.filter(key => 
          key !== null && 
          key !== undefined && 
          key !== '0x0000000000000000000000000000000000000000000000000000000000000000'
        );
        
        devLog.log(`[${requestId}] 🔑 Keys for batch ${i}-${batchEnd - 1}:`, {
          totalKeys: reservationKeys.length,
          validKeys: validKeys.length,
          sampleKeys: validKeys.slice(0, 3).map(key => key ? `${key.toString().slice(0, 20)}...` : 'null')
        });
        
        if (validKeys.length === 0) {
          devLog.warn(`[${requestId}] ⚠️ No valid keys in batch ${i}-${batchEnd - 1}`);
          continue;
        }
        
        // Get reservation details for valid keys with timeout
        const reservationPromises = validKeys.map((key) => 
          Promise.race([
            contract.getReservation(key),
            new Promise((_, reject) => 
              setTimeout(() => reject(new Error(`Reservation fetch timeout for key ${key}`)), 3000) // 3 second timeout per reservation
            )
          ])
            .then(reservation => {
              return { key, reservation };
            })
            .catch(error => {
              devLog.warn(`[${requestId}] ⚠️ Failed to get reservation for key ${key}:`, error.message);
              return null;
            })
        );
        
        const reservationResults = await Promise.all(reservationPromises);
        const validReservations = reservationResults.filter(res => res !== null && res !== undefined && res.reservation !== null);
        
        devLog.log(`[${requestId}] 📊 Batch ${i}-${batchEnd - 1} results:`, {
          total: reservationResults.length,
          valid: validReservations.length,
          null: reservationResults.filter(r => r === null).length,
          undefined: reservationResults.filter(r => r === undefined).length
        });
        
        // Filter for relevant reservations (performance optimization)
        const relevantReservations = validReservations.filter(res => isReservationRelevant(res.reservation));
        
        devLog.log(`[${requestId}] 📦 Batch processed: ${validReservations.length} total, ${relevantReservations.length} relevant`);
        allReservations.push(...relevantReservations);
        
        // Small delay between batches to avoid overwhelming RPC
        if (batchEnd < totalCount) {
          // Adaptive delay based on rate limit detection - reduced delays
          const batchDelay = rateLimitDetected ? 300 : 50; // Shorter delays
          await new Promise(resolve => setTimeout(resolve, batchDelay));
        }
        
      } catch (batchError) {
        devLog.error(`[${requestId}] ❌ Error processing batch ${i}-${batchEnd - 1}:`, batchError.message);
        // Continue with next batch instead of failing completely
        continue;
      }
    }
    
    const fetchTime = Date.now() - blockchainStartTime;
    devLog.log(`[${requestId}] ✅ Individual fetch completed:`, {
      totalCount,
      relevantCount: allReservations.length,
      time: `${fetchTime}ms`,
      avgTimePerReservation: `${Math.round(fetchTime / Math.max(totalCount, 1))}ms`
    });
    
    return allReservations;
    
  } catch (error) {
    devLog.error(`[${requestId}] ❌ Error in individual reservation fetch:`, error.message);
    throw error;
  }
}

async function handleRequest(wallet, clearCache = false) {
  // wallet can be null to fetch all bookings, or a specific address to filter by user
  const startTime = Date.now();
  const requestId = Math.random().toString(36).substr(2, 9);
  
  devLog.log(`[${requestId}] 📊 getBookings request started`, {
    wallet: wallet ? `${wallet.slice(0, 6)}...${wallet.slice(-4)}` : 'ALL',
    clearCache,
    rateLimitDetected,
    timestamp: new Date().toISOString()
  });

  try {
    // STEP 0: Early rate limit check - if recently rate limited, add initial delay
    if (rateLimitDetected && (Date.now() - lastRateLimitTime < RATE_LIMIT_COOLDOWN)) {
      const remainingCooldown = RATE_LIMIT_COOLDOWN - (Date.now() - lastRateLimitTime);
      devLog.log(`[${requestId}] ⏱️ Rate limit cooldown active, waiting ${remainingCooldown}ms...`);
      await new Promise(resolve => setTimeout(resolve, remainingCooldown));
    }

    // STEP 1: Check normal cache first (30 seconds) - skip if clearCache is true
    if (!clearCache && isCacheValid()) {
      devLog.log(`[${requestId}] ⚡ Cache HIT - serving from cache`, {
        cacheAge: `${Math.round((Date.now() - getCache().timestamp) / 1000)}s`
      });
      const cache = getCache();
      let bookings = cache.data;
      
      // Filter by user if wallet provided
      if (wallet) {
        const originalCount = bookings.length;
        bookings = bookings.filter(reservation => 
          reservation.renter.toLowerCase() === wallet.toLowerCase()
        );
        devLog.log(`[${requestId}] 🔍 Filtered bookings: ${originalCount} → ${bookings.length} for user`);
      }
      
      const responseTime = Date.now() - startTime;
      devLog.log(`[${requestId}] ✅ Request completed via cache in ${responseTime}ms`);
      
      return Response.json(bookings, { 
        status: 200,
        headers: { 
          'X-Cache': 'HIT',
          'X-Request-ID': requestId,
          'X-Response-Time': `${responseTime}ms`
        }
      });
    }

    devLog.log(`[${requestId}] 📡 Cache MISS - fetching from blockchain`);
    const blockchainStartTime = Date.now();
    
    // STEP 2: Try to get contract instance with timeout
    let contract;
    try {
      contract = await Promise.race([
        getContractInstance(),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Contract instance timeout')), 10000)
        )
      ]);
      devLog.log(`[${requestId}] 🔗 Contract instance created (${Date.now() - blockchainStartTime}ms)`);
    } catch (contractError) {
      devLog.error(`[${requestId}] ❌ Contract instance failed:`, {
        error: contractError.message,
        time: `${Date.now() - blockchainStartTime}ms`
      });
      throw new Error('RPC_UNAVAILABLE');
    }

    // STEP 3: Fetch reservations individually for better performance and reliability
    let allReservationsData;
    try {
      devLog.log(`[${requestId}] 📡 Fetching reservations individually...`);
      
      // Use individual fetching method
      allReservationsData = await Promise.race([
        fetchReservationsIndividually(contract, requestId),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Individual fetch timeout')), 15000) // Reduced to 15 seconds
        )
      ]);
      
    } catch (blockchainError) {
      devLog.warn(`[${requestId}] ⚠️ Individual reservation fetch failed:`, {
        error: blockchainError.message,
        time: `${Date.now() - blockchainStartTime}ms`,
        isRateLimit: isRateLimitError(blockchainError)
      });
      
      // Handle rate limiting specifically
      if (isRateLimitError(blockchainError)) {
        rateLimitDetected = true;
        lastRateLimitTime = Date.now();
        devLog.warn(`[${requestId}] 🚫 Rate limit detected in individual fetch`);
      }
      
      // Check for RATE_LIMITED_USE_CACHE error (thrown when cache is available)
      if (blockchainError.message === 'RATE_LIMITED_USE_CACHE') {
        devLog.log(`[${requestId}] 🔄 Using extended cache due to rate limiting`);
        let bookings = extendedCache;
        
        if (wallet) {
          bookings = bookings.filter(reservation => 
            reservation.renter.toLowerCase() === wallet.toLowerCase()
          );
        }
        
        return Response.json(bookings, { 
          status: 200,
          headers: { 
            'X-Cache': 'EXTENDED-RATE-LIMITED',
            'X-Request-ID': requestId,
            'X-Response-Time': `${Date.now() - startTime}ms`
          }
        });
      }
      
      // Check for RATE_LIMITED_NO_CACHE error (don't cache empty results)
      if (blockchainError.message === 'RATE_LIMITED_NO_CACHE') {
        devLog.warn(`[${requestId}] 🚫 Rate limited with no cache - returning temporary error`);
        return Response.json({ 
          error: 'Rate limited - please try again in a few seconds',
          message: 'The blockchain network is currently rate limiting requests. Please wait and try again.',
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
      
      // If individual fetch fails, try a simpler approach with just total count
      try {
        const totalReservationsResult = await Promise.race([
          contract.totalReservations(),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('totalReservations timeout')), 5000)
          )
        ]);
        
        devLog.log(`[${requestId}] 🔍 Fallback totalReservations result:`, {
          result: totalReservationsResult,
          type: typeof totalReservationsResult,
          isNull: totalReservationsResult === null,
          isUndefined: totalReservationsResult === undefined
        });
        
        let totalCount = 0;
        if (totalReservationsResult === undefined || totalReservationsResult === null) {
          totalCount = 0;
        } else if (typeof totalReservationsResult === 'bigint') {
          totalCount = Number(totalReservationsResult);
        } else if (typeof totalReservationsResult === 'number') {
          totalCount = totalReservationsResult;
        } else if (totalReservationsResult && typeof totalReservationsResult.toString === 'function') {
          totalCount = parseInt(totalReservationsResult.toString());
        } else {
          totalCount = 0;
        }
        
        if (totalCount === 0) {
          devLog.log(`[${requestId}] 📭 No reservations available (total: ${totalCount})`);
          allReservationsData = [];
        } else {
          // If we can't fetch individually, at least log the total and return empty for now
          devLog.warn(`[${requestId}] ⚠️ Found ${totalCount} reservations but individual fetch failed`);
          allReservationsData = [];
        }
      } catch (totalError) {
        devLog.error(`[${requestId}] ❌ Even totalReservations failed:`, totalError.message);
        throw new Error('CONTRACT_UNREACHABLE');
      }
    }
    
    // STEP 4: Process and format the reservations
    const blockchainTime = Date.now() - blockchainStartTime;
    
    // Generate stable keys for reservations (needed for frontend operations)
    const allReservations = allReservationsData.map((reservationData, index) => {
      const reservationKey = reservationData.key;
      const reservation = reservationData.reservation;
      
      return {
        reservationKey: reservationKey,
        labId: reservation.labId.toString(),
        renter: reservation.renter,
        price: reservation.price?.toString() || "0", // Handle missing price field
        start: reservation.start.toString(),
        end: reservation.end.toString(),
        status: reservation.status.toString(),
        date: new Date(parseInt(reservation.start) * 1000).toLocaleDateString('en-US'),
        id: index
      };
    });

    devLog.log(`[${requestId}] 🔄 Processing completed:`, {
      rawCount: allReservationsData.length,
      processedCount: allReservations.length,
      blockchainTime: `${blockchainTime}ms`
    });

    // Filter by user if wallet provided
    let bookings = allReservations;
    if (wallet) {
      const originalCount = bookings.length;
      bookings = bookings.filter(reservation => 
        reservation.renter.toLowerCase() === wallet.toLowerCase()
      );
      devLog.log(`[${requestId}] 🔍 Filtered bookings: ${originalCount} → ${bookings.length} for user`);
    }

    // STEP 5: Only cache results if we have actual data (not rate limited)
    if (allReservations.length > 0 || !rateLimitDetected) {
      setCache(allReservations);
      extendedCache = allReservations;
      extendedCacheTimestamp = Date.now();
      devLog.log(`[${requestId}] 💾 Results cached: ${allReservations.length} reservations`);
    } else {
      devLog.warn(`[${requestId}] 🚫 Not caching empty results due to rate limiting`);
    }

    const totalResponseTime = Date.now() - startTime;
    devLog.log(`[${requestId}] ✅ Request completed successfully:`, {
      total: allReservations.length,
      filtered: bookings.length,
      totalTime: `${totalResponseTime}ms`,
      blockchainTime: `${blockchainTime}ms`,
      cached: true
    });

    return Response.json(bookings, { 
      status: 200,
      headers: { 
        'X-Cache': 'MISS',
        'X-Request-ID': requestId,
        'X-Response-Time': `${totalResponseTime}ms`,
        'X-Blockchain-Time': `${blockchainTime}ms`
      }
    });
    
  } catch (error) {
    const totalTime = Date.now() - startTime;
    devLog.error(`[${requestId}] 💥 Request failed after ${totalTime}ms:`, {
      error: error.message,
      wallet: wallet ? 'user' : 'all'
    });

    // Check for extended cache during RPC issues
    if (extendedCache && (Date.now() - extendedCacheTimestamp < EXTENDED_CACHE_DURATION)) {
      devLog.log(`[${requestId}] 🔄 Using extended cache due to RPC issues`);
      let bookings = extendedCache;
      
      if (wallet) {
        bookings = bookings.filter(reservation => 
          reservation.renter.toLowerCase() === wallet.toLowerCase()
        );
      }
      
      return Response.json(bookings, { 
        status: 200,
        headers: { 
          'X-Cache': 'EXTENDED',
          'X-Request-ID': requestId,
          'X-Response-Time': `${totalTime}ms`
        }
      });
    }
    
    // Fallback to simulation data if all else fails
    if (error.message.includes('RPC_UNAVAILABLE') || error.message.includes('CONTRACT_UNREACHABLE')) {
      devLog.log(`[${requestId}] 📋 Using fallback simulation data`);
      const fallbackBookings = simBookings();
      
      let bookings = fallbackBookings;
      if (wallet) {
        bookings = bookings.filter(reservation => 
          reservation.renter.toLowerCase() === wallet.toLowerCase()
        );
      }
      
      return Response.json(bookings, { 
        status: 200,
        headers: { 
          'X-Fallback': 'SIMULATION',
          'X-Request-ID': requestId,
          'X-Response-Time': `${totalTime}ms`
        }
      });
    }

    return Response.json({ 
      error: 'Failed to fetch reservations',
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