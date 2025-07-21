import { simBookings } from '@/utils/simBookings';
import { getContractInstance } from '../../utils/contractInstance';
import retry from '@/utils/retry';
import { getCache, setCache, isCacheValid } from '../cache';
import devLog from '@/utils/logger';

// Extended cache for RPC failure scenarios  
let extendedCache = null;
let extendedCacheTimestamp = null;
const EXTENDED_CACHE_DURATION = 300000; // 5 minutes during RPC issues

export async function GET() {
  // Support GET requests for fetching all bookings
  return handleRequest(null);
}

export async function POST(request) {
  const body = await request.json();
  const { wallet } = body;
  return handleRequest(wallet);
}

async function handleRequest(wallet) {
  // wallet can be null to fetch all bookings, or a specific address to filter by user
  const startTime = Date.now();
  const requestId = Math.random().toString(36).substr(2, 9);
  
  devLog.log(`[${requestId}] 📊 getBookings request started`, {
    wallet: wallet ? `${wallet.slice(0, 6)}...${wallet.slice(-4)}` : 'ALL',
    timestamp: new Date().toISOString()
  });

  try {
    // STEP 1: Check normal cache first (30 seconds)
    if (isCacheValid()) {
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

    // STEP 3: Try optimized blockchain call with shorter timeout
    let allReservationsData;
    try {
      // Debug contract details before calling getAllReservations
      devLog.log(`[${requestId}] 🔍 Contract debug info:`, {
        contractAddress: contract.address || contract.target,
        hasGetAllReservations: typeof contract.getAllReservations === 'function',
        contractMethods: Object.getOwnPropertyNames(contract).filter(name => typeof contract[name] === 'function')
      });

      // Test a simpler method first to verify contract connectivity
      try {
        devLog.log(`[${requestId}] 🧪 Testing getLabTokenAddress()...`);
        const labTokenAddress = await contract.getLabTokenAddress();
        devLog.log(`[${requestId}] ✅ getLabTokenAddress result:`, labTokenAddress);
      } catch (testError) {
        devLog.error(`[${requestId}] ❌ getLabTokenAddress failed:`, testError.message);
      }

      devLog.log(`[${requestId}] 📡 Calling contract.getAllReservations()...`);
      
      const result = await Promise.race([
        retry(async () => {
          devLog.log(`[${requestId}] 🔄 Attempting getAllReservations call...`);
          const response = await contract.getAllReservations();
          devLog.log(`[${requestId}] 📥 getAllReservations raw response:`, {
            response: response,
            type: typeof response,
            constructor: response?.constructor?.name,
            isArray: Array.isArray(response),
            length: response?.length,
            stringified: JSON.stringify(response)?.substring(0, 200)
          });
          return response;
        }, { maxRetries: 2, delay: 1000 }),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('getAllReservations timeout')), 15000)
        )
      ]);
      
      // Enhanced logging to debug getAllReservations response
      devLog.log(`[${requestId}] 🔍 getAllReservations final result:`, {
        result: result,
        type: typeof result,
        isArray: Array.isArray(result),
        length: result?.length,
        firstItem: result?.[0],
        isNullish: result == null,
        isUndefined: result === undefined,
        isNull: result === null
      });
      
      // Handle undefined/null result from RPC saturation or contract issues
      if (result === undefined || result === null) {
        devLog.warn(`[${requestId}] ⚠️ getAllReservations returned ${result} - this may indicate no reservations exist or a contract issue`);
        // Instead of throwing error, treat as empty array
        allReservationsData = [];
        const fetchTime = Date.now() - blockchainStartTime;
        devLog.log(`[${requestId}] 📭 Treating undefined getAllReservations as empty array:`, {
          count: 0,
          time: `${fetchTime}ms`,
          method: 'optimized-empty'
        });
      } else {
        allReservationsData = Array.isArray(result) ? result : [];
        const fetchTime = Date.now() - blockchainStartTime;
        devLog.log(`[${requestId}] 🎯 getAllReservations success:`, {
          count: allReservationsData.length,
          time: `${fetchTime}ms`,
          method: 'optimized'
        });
      }
    } catch (blockchainError) {
      const fallbackStartTime = Date.now();
      devLog.warn(`[${requestId}] ⚠️ getAllReservations failed, trying fallback:`, {
        error: blockchainError.message,
        time: `${fallbackStartTime - blockchainStartTime}ms`
      });
      
      // FALLBACK: Use the original individual calls method but with smaller batch
      try {
        const totalReservations = await retry(() => contract.totalReservations(), { maxRetries: 1, delay: 500 });
        devLog.log(`[${requestId}] 🔍 totalReservations raw result:`, {
          result: totalReservations,
          type: typeof totalReservations,
          toString: totalReservations?.toString?.()
        });
        
        // Handle undefined/null result from RPC issues
        if (totalReservations === undefined || totalReservations === null) {
          devLog.warn(`[${requestId}] ⚠️ totalReservations returned ${totalReservations}, using empty data`);
          allReservationsData = [];
        } else if (totalReservations === 0n) {
          allReservationsData = [];
        } else {
          const maxToFetch = Math.min(Number(totalReservations), 20);
          devLog.log(`[${requestId}] 🔄 Fetching last ${maxToFetch}/${Number(totalReservations)} reservations individually...`);
          
          const reservationPromises = [];
          for (let i = Math.max(0, Number(totalReservations) - maxToFetch); i < Number(totalReservations); i++) {
            reservationPromises.push(
              retry(() => contract.reservationKeyByIndex(i), { maxRetries: 1, delay: 200 })
                .then(key => retry(() => contract.getReservation(key), { maxRetries: 1, delay: 200 }))
                .catch(err => {
                  devLog.warn(`Failed to get reservation at index ${i}:`, err);
                  return null;
                })
            );
          }
          
          const results = await Promise.all(reservationPromises);
          allReservationsData = results.filter(r => r !== null);
          const totalFallbackTime = Date.now() - fallbackStartTime;
          devLog.log(`[${requestId}] 🔄 Fallback method completed:`, {
            fetched: allReservationsData.length,
            total: Number(totalReservations),
            time: `${totalFallbackTime}ms`,
            method: 'individual'
          });
        }
      } catch (fallbackError) {
        devLog.error(`[${requestId}] ❌ Both methods failed:`, {
          primary: blockchainError.message,
          fallback: fallbackError.message,
          totalTime: `${Date.now() - blockchainStartTime}ms`
        });
        throw new Error('BLOCKCHAIN_CALL_FAILED');
      }
    }
    
    if (allReservationsData.length === 0) {
      devLog.log(`[${requestId}] 📭 No reservations found, caching empty result`);
      setCache([]);
      // Also cache in extended cache
      extendedCache = [];
      extendedCacheTimestamp = Date.now();
      
      const responseTime = Date.now() - startTime;
      return Response.json([], { 
        status: 200,
        headers: {
          'X-Request-ID': requestId,
          'X-Response-Time': `${responseTime}ms`
        }
      });
    }

    // STEP 4: Process reservation keys efficiently
    let reservationKeys = [];
    
    // Check if wallet is provided - if so, we might need real keys for user operations
    const needRealKeys = wallet !== null;
    
    if (needRealKeys) {
      // Get keys in parallel for better performance with shorter timeout
      devLog.log(`[${requestId}] 🔑 Fetching reservation keys for user operations...`);
      try {
        reservationKeys = await Promise.race([
          Promise.all(
            Array.from({ length: allReservationsData.length }, async (_, i) => {
              try {
                return await retry(() => contract.reservationKeyByIndex(i), { maxRetries: 1, delay: 500 });
              } catch (error) {
                devLog.warn(`[${requestId}] ⚠️ Failed to get reservation key at index ${i}:`, error.message);
                // Generate a deterministic key based on reservation data for consistency
                const reservation = allReservationsData[i];
                return `0x${Buffer.from(`${reservation.labId}_${reservation.renter}_${reservation.start}_${reservation.end}`).toString('hex').padStart(64, '0')}`;
              }
            })
          ),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Reservation keys timeout')), 10000)
          )
        ]);
      } catch (keysError) {
        devLog.warn(`[${requestId}] 🔑 Failed to get reservation keys, using generated keys:`, keysError.message);
        // Fallback to generated keys
        reservationKeys = allReservationsData.map((reservation) => {
          return `0x${Buffer.from(`${reservation.labId}_${reservation.renter}_${reservation.start}_${reservation.end}`).toString('hex').padStart(64, '0')}`;
        });
      }
    } else {
      // For display purposes, generate stable keys based on reservation data
      reservationKeys = allReservationsData.map((reservation) => {
        return `0x${Buffer.from(`${reservation.labId}_${reservation.renter}_${reservation.start}_${reservation.end}`).toString('hex').padStart(64, '0')}`;
      });
    }

    // STEP 5: Process and format data
    const allReservations = allReservationsData.map((reservation, index) => {
      return {
        reservationKey: reservationKeys[index],
        labId: reservation.labId.toString(),
        renter: reservation.renter,
        price: reservation.price.toString(),
        start: reservation.start.toString(),
        end: reservation.end.toString(),
        status: reservation.status.toString()
      };
    });

    // Convert to the expected format for the frontend
    const formattedBookings = allReservations.map(reservation => {
      const startTime = new Date(parseInt(reservation.start) * 1000);
      const endTime = new Date(parseInt(reservation.end) * 1000);
      const currentTime = new Date();
      
      return {
        reservationKey: reservation.reservationKey,
        labId: reservation.labId,
        renter: reservation.renter,
        date: startTime.toISOString().split('T')[0], // YYYY-MM-DD format
        time: startTime.toTimeString().slice(0, 5), // HH:MM format
        minutes: Math.round((endTime - startTime) / (1000 * 60)), // Duration in minutes
        start: reservation.start,
        end: reservation.end,
        status: reservation.status,
        activeBooking: reservation.status === '1' && startTime <= currentTime && endTime > currentTime
      };
    });

    // STEP 6: Cache the results (both normal and extended)
    setCache(formattedBookings);
    extendedCache = formattedBookings;
    extendedCacheTimestamp = Date.now();

    // Filter by user if wallet provided
    let bookings = formattedBookings;
    
    if (wallet) {
      const originalCount = bookings.length;
      bookings = bookings.filter(reservation => 
        reservation.renter.toLowerCase() === wallet.toLowerCase()
      );
      devLog.log(`[${requestId}] 🔍 User filter applied: ${originalCount} → ${bookings.length}`);
    }

    const totalResponseTime = Date.now() - startTime;
    const blockchainTime = Date.now() - blockchainStartTime;
    
    devLog.log(`[${requestId}] ✅ Request completed successfully:`, {
      totalBookings: formattedBookings.length,
      userBookings: bookings.length,
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
      wallet: wallet ? 'user' : 'all',
      fallbacksAttempted: 0
    });
    
    // FALLBACK 1: Try extended cache (5 minutes) during RPC saturation
    const now = Date.now();
    if (extendedCache && extendedCacheTimestamp && (now - extendedCacheTimestamp < EXTENDED_CACHE_DURATION)) {
      devLog.log(`[${requestId}] 🕐 Using extended cache (${Math.round((now - extendedCacheTimestamp) / 1000)}s old)`);
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
          'X-Fallback': 'RPC_SATURATED',
          'X-Request-ID': requestId,
          'X-Response-Time': `${Date.now() - startTime}ms`
        }
      });
    }
    
    // FALLBACK 2: Try to get ANY cached data regardless of age (emergency fallback)
    const emergencyCache = getCache();
    if (emergencyCache.data && emergencyCache.data.length > 0) {
      const cacheAge = Math.round((now - emergencyCache.timestamp) / 1000);
      devLog.log(`[${requestId}] 🚨 Using emergency cache (${cacheAge}s old)`);
      let bookings = emergencyCache.data;
      
      if (wallet) {
        bookings = bookings.filter(reservation => 
          reservation.renter.toLowerCase() === wallet.toLowerCase()
        );
      }
      
      return Response.json(bookings, { 
        status: 200,
        headers: { 
          'X-Cache': 'EMERGENCY',
          'X-Fallback': 'STALE_CACHE'
        }
      });
    }
    
    // FALLBACK 3: Check if we have any extended cache, even if expired
    if (extendedCache && extendedCache.length > 0) {
      devLog.warn(`[${requestId}] ⚠️ Using expired extended cache as last resort`);
      let bookings = extendedCache;
      
      if (wallet) {
        bookings = bookings.filter(reservation => 
          reservation.renter.toLowerCase() === wallet.toLowerCase()
        );
      }
      
      return Response.json(bookings, { 
        status: 200,
        headers: { 
          'X-Cache': 'EXPIRED',
          'X-Fallback': 'EXPIRED_CACHE'
        }
      });
    }
    
    // FALLBACK 4: Simulated bookings for demo purposes
    devLog.warn(`[${requestId}] 🎭 All caches empty, using simulated data`);
    try {
      const fallbackBookings = simBookings();
      devLog.log(`[${requestId}] ✅ Fallback completed with simulated data (${fallbackBookings.length} items)`);
      return Response.json(fallbackBookings, { 
        status: 200,
        headers: { 
          'X-Cache': 'SIMULATED',
          'X-Fallback': 'DEMO_DATA',
          'X-Request-ID': requestId,
          'X-Response-Time': `${Date.now() - startTime}ms`
        }
      });
    } catch (fallbackError) {
      devLog.error(`[${requestId}] ❌ Simulated bookings failed:`, fallbackError.message);
      
      // FALLBACK 5: Empty array with error information
      const finalTime = Date.now() - startTime;
      devLog.error(`[${requestId}] 💀 Total system failure after ${finalTime}ms`);
      
      return Response.json([], { 
        status: 200,
        headers: { 
          'X-Cache': 'EMPTY',
          'X-Fallback': 'TOTAL_FAILURE',
          'X-Error': error.message?.substring(0, 100) || 'Unknown error',
          'X-Request-ID': requestId,
          'X-Response-Time': `${finalTime}ms`
        }
      });
    }
  }
}
