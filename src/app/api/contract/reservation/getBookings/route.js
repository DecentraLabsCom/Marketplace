import { getCache, setCache, isCacheValid } from '../cache';
import { getContractInstance } from '../../utils/contractInstance';
import { simBookings } from '@/utils/simBookings';
import retry from '@/utils/retry';
import devLog from '@/utils/logger';

// Extended cache for RPC failure scenarios  
let extendedCache = null;
let extendedCacheTimestamp = null;
const EXTENDED_CACHE_DURATION = 300000; // 5 minutes during RPC issues

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

// Helper function to calculate if a reservation is in a relevant time window
function isReservationRelevant(reservation) {
  const now = Date.now() / 1000; // Unix timestamp in seconds
  const start = parseInt(reservation.start);
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
        
    // Call totalReservations
    let totalReservationsResult;
    try {
      devLog.log(`[${requestId}] 🔄 Attempting direct call to totalReservations()...`);
      totalReservationsResult = await contract.totalReservations();
      devLog.log(`[${requestId}] 📥 Direct call result:`, {
        result: totalReservationsResult,
        type: typeof totalReservationsResult,
        constructor: totalReservationsResult?.constructor?.name
      });
    } catch (directError) {
      devLog.error(`[${requestId}] ❌ Direct call failed:`, directError.message);
      
      // Try with retry wrapper
      try {
        devLog.log(`[${requestId}] 🔄 Attempting with retry wrapper...`);
        totalReservationsResult = await retry(() => contract.totalReservations(), { maxRetries: 2, delay: 500 });
        devLog.log(`[${requestId}] 📥 Retry wrapper result:`, {
          result: totalReservationsResult,
          type: typeof totalReservationsResult
        });
      } catch (retryError) {
        devLog.error(`[${requestId}] ❌ Retry wrapper also failed:`, retryError.message);
        throw retryError;
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
    } else {
      devLog.warn(`[${requestId}] ⚠️ Unexpected totalReservations type:`, {
        type: typeof totalReservationsResult,
        value: totalReservationsResult
      });
      totalCount = 0;
    }
    
    devLog.log(`[${requestId}] 📋 Total reservations in contract: ${totalCount} (Expected from Etherscan: 81)`);
    
    // Step 2: Get reservation keys in batches to avoid overwhelming RPC
    const BATCH_SIZE = 10; // Process in small batches to avoid RPC saturation
    const allReservations = [];
    const now = Date.now() / 1000;
    
    for (let i = 0; i < totalCount; i += BATCH_SIZE) {
      const batchEnd = Math.min(i + BATCH_SIZE, totalCount);
      devLog.log(`[${requestId}] 🔄 Processing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(totalCount / BATCH_SIZE)} (${i}-${batchEnd - 1})`);
      
      try {
        // Get reservation keys for this batch
        const keyPromises = [];
        for (let j = i; j < batchEnd; j++) {
          keyPromises.push(
            contract.reservationKeyByIndex(j)
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
        
        // Get reservation details for valid keys
        const reservationPromises = validKeys.map((key, index) => 
          contract.getReservation(key)
            .then(reservation => {
              return reservation;
            })
            .catch(error => {
              devLog.warn(`[${requestId}] ⚠️ Failed to get reservation for key ${key}:`, error.message);
              return null;
            })
        );
        
        const reservations = await Promise.all(reservationPromises);
        const validReservations = reservations.filter(res => res !== null && res !== undefined);
        
        devLog.log(`[${requestId}] 📊 Batch ${i}-${batchEnd - 1} results:`, {
          total: reservations.length,
          valid: validReservations.length,
          null: reservations.filter(r => r === null).length,
          undefined: reservations.filter(r => r === undefined).length
        });
        
        // Filter for relevant reservations (performance optimization)
        const relevantReservations = validReservations.filter(isReservationRelevant);
        
        devLog.log(`[${requestId}] 📦 Batch processed: ${validReservations.length} total, ${relevantReservations.length} relevant`);
        allReservations.push(...relevantReservations);
        
        // Small delay between batches to avoid overwhelming RPC
        if (batchEnd < totalCount) {
          await new Promise(resolve => setTimeout(resolve, 100));
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
    timestamp: new Date().toISOString()
  });

  try {
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
      devLog.log(`[${requestId}] 🔍 Contract debug info:`, {
        contractAddress: contract.address || contract.target,
        hasTotalReservations: typeof contract.totalReservations === 'function',
        hasReservationKeyByIndex: typeof contract.reservationKeyByIndex === 'function',
        hasGetReservation: typeof contract.getReservation === 'function'
      });

      devLog.log(`[${requestId}] 📡 Fetching reservations individually...`);
      
      // Use individual fetching method
      allReservationsData = await Promise.race([
        fetchReservationsIndividually(contract, requestId),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Individual fetch timeout')), 30000)
        )
      ]);
      
    } catch (blockchainError) {
      devLog.warn(`[${requestId}] ⚠️ Individual reservation fetch failed:`, {
        error: blockchainError.message,
        time: `${Date.now() - blockchainStartTime}ms`
      });
      
      // If individual fetch fails, try a simpler approach with just total count
      try {
        const totalReservationsResult = await retry(() => contract.totalReservations(), { maxRetries: 1, delay: 500 });
        
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
    const allReservations = allReservationsData.map((reservation, index) => {
      // Generate deterministic key based on reservation data
      const keyData = `${reservation.labId}_${reservation.renter}_${reservation.start}_${reservation.end}`;
      const reservationKey = `0x${Buffer.from(keyData).toString('hex').padStart(64, '0')}`;
      
      return {
        reservationKey,
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

    // STEP 5: Cache the results
    setCache(allReservations);
    extendedCache = allReservations;
    extendedCacheTimestamp = Date.now();

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