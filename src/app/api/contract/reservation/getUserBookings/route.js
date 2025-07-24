import devLog from '@/utils/logger';
import { getContractInstance } from '../../utils/contractInstance';
import { isAddress } from 'viem';
import { ethers } from 'ethers';

// Rate limiting and cache management
let rateLimitDetected = false;
let lastRateLimitTime = 0;
let consecutiveRateLimits = 0;
const RATE_LIMIT_COOLDOWN = 10000; // 10 seconds
const CACHE_DURATION = 30000; // 30 seconds cache
const EXTENDED_CACHE_DURATION = 300000; // 5 minutes extended cache

// Cache for user reservations
const userReservationsCache = new Map();

// Helper function to check if error is rate limiting
function isRateLimitError(error) {
  const errorMsg = error.message?.toLowerCase() || '';
  return errorMsg.includes('rate limit') || 
         errorMsg.includes('too many requests') || 
         errorMsg.includes('429') ||
         errorMsg.includes('exceeded');
}

// Cache helpers
function getCacheKey(userAddress) {
  return `user_reservations_${userAddress.toLowerCase()}`;
}

function isCacheValid(userAddress) {
  const cacheKey = getCacheKey(userAddress);
  const cached = userReservationsCache.get(cacheKey);
  return cached && (Date.now() - cached.timestamp) < CACHE_DURATION;
}

function getCache(userAddress) {
  const cacheKey = getCacheKey(userAddress);
  return userReservationsCache.get(cacheKey);
}

function setCache(userAddress, data) {
  const cacheKey = getCacheKey(userAddress);
  userReservationsCache.set(cacheKey, {
    data,
    timestamp: Date.now()
  });
}

// Main handler function
async function handleRequest(userAddress, clearCache = false) {
  const startTime = Date.now();
  const requestId = Math.random().toString(36).substr(2, 9);
  
  devLog.log(`[${requestId}] 👤 getUserBookings request started`, {
    userAddress: `${userAddress.slice(0, 6)}...${userAddress.slice(-4)}`,
    clearCache,
    rateLimitDetected,
    timestamp: new Date().toISOString()
  });

  try {
    // Prepare checksum address upfront
    let checksumAddress;
    try {
      checksumAddress = ethers.getAddress(userAddress);
      devLog.log(`[${requestId}] 🔐 Using checksum address:`, checksumAddress);
    } catch (checksumError) {
      devLog.warn(`[${requestId}] ⚠️ Checksum conversion failed:`, checksumError.message);
      checksumAddress = userAddress;
    }

    // Early rate limit check
    if (rateLimitDetected && (Date.now() - lastRateLimitTime < RATE_LIMIT_COOLDOWN)) {
      const remainingCooldown = RATE_LIMIT_COOLDOWN - (Date.now() - lastRateLimitTime);
      devLog.log(`[${requestId}] ⏱️ Rate limit cooldown active, waiting ${remainingCooldown}ms...`);
      await new Promise(resolve => setTimeout(resolve, remainingCooldown));
    }

    // Check cache first (skip if clearCache is true)
    if (!clearCache && isCacheValid(userAddress)) {
      devLog.log(`[${requestId}] ⚡ Cache HIT - serving from cache`);
      const cache = getCache(userAddress);
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
      devLog.log(`[${requestId}] 🔍 Contract debug info:`, {
        contractAddress: contract.address || contract.target,
        hasReservationsOf: typeof contract.reservationsOf === 'function',
        hasReservationKeyOfUserByIndex: typeof contract.reservationKeyOfUserByIndex === 'function',
        hasGetReservation: typeof contract.getReservation === 'function',
      });
    } catch (contractError) {
      devLog.error(`[${requestId}] ❌ Contract instance failed:`, contractError.message);
      throw new Error('RPC_UNAVAILABLE');
    }

    // Fetch user reservations using reservationsOf and reservationKeyOfUserByIndex
    const blockchainStartTime = Date.now();
    let userReservationCount;
    
    try {
      devLog.log(`[${requestId}] 📡 Calling reservationsOf for user...`);
      
      userReservationCount = await Promise.race([
        contract.reservationsOf(checksumAddress),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('reservationsOf timeout')), 15000)
        )
      ]);
 
      devLog.log(`[${requestId}] �📊 User has ${userReservationCount?.toString() || 0} reservations`);

      // Reset rate limit flag on successful call
      if (rateLimitDetected) {
        devLog.log(`[${requestId}] ✅ Rate limit cleared`);
        rateLimitDetected = false;
        lastRateLimitTime = 0;
        consecutiveRateLimits = 0;
      }

    } catch (blockchainError) {
      devLog.warn(`[${requestId}] ⚠️ reservationsOf failed:`, blockchainError.message);
      
      // Handle timeout specifically
      if (blockchainError.message?.includes('timeout')) {
        devLog.warn(`[${requestId}] ⏱️ Timeout detected - network may be slow`);
        
        // Check for extended cache during timeout
        const extendedCache = getCache(userAddress);
        if (extendedCache && (Date.now() - extendedCache.timestamp < EXTENDED_CACHE_DURATION)) {
          devLog.log(`[${requestId}] 💾 Using extended cache due to timeout`);
          return Response.json(extendedCache.data, {
            status: 200,
            headers: {
              'X-Cache': 'EXTENDED-TIMEOUT',
              'X-Request-ID': requestId,
              'X-Response-Time': `${Date.now() - startTime}ms`
            }
          });
        }
        
        return Response.json({ 
          error: 'Network timeout - please try again',
          message: 'The blockchain network is taking too long to respond. Please try again in a moment.',
          requestId,
          retryAfter: 10
        }, { 
          status: 408, // Request Timeout
          headers: {
            'X-Request-ID': requestId,
            'X-Response-Time': `${Date.now() - startTime}ms`,
            'Retry-After': '10'
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
        const extendedCache = getCache(userAddress);
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
    if (!userReservationCount || Number(userReservationCount) === 0) {
      const emptyResult = [];
      setCache(userAddress, emptyResult);
      
      const totalTime = Date.now() - startTime;
      devLog.log(`[${requestId}] ✅ No reservations found for user (${totalTime}ms)`);
      
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
    const reservationCount = Number(userReservationCount);
    
    // Fetch detailed reservation data for each user reservation
    devLog.log(`[${requestId}] 🔍 Fetching detailed data for ${reservationCount} reservations...`);
    
    const reservationPromises = Array.from({ length: reservationCount }, async (_, index) => {
      try {
        // Get reservation key by index
        const reservationKey = await Promise.race([
          contract.reservationKeyOfUserByIndex(checksumAddress, index),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error(`Key fetch timeout for index ${index}`)), 3000)
          )
        ]);
        
        if (!reservationKey || reservationKey === '0x0000000000000000000000000000000000000000000000000000000000000000') {
          devLog.warn(`[${requestId}] ⚠️ Invalid reservation key for index ${index}`);
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
        
        return {
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
        
      } catch (error) {
        devLog.warn(`[${requestId}] ⚠️ Failed to get reservation at index ${index}:`, error.message);
        return null;
      }
    });

    const reservationResults = await Promise.all(reservationPromises);
    const validReservations = reservationResults.filter(res => res !== null);
    
    const blockchainTime = Date.now() - blockchainStartTime;
    
    devLog.log(`[${requestId}] 📦 Processed reservations:`, {
      total: reservationCount,
      valid: validReservations.length,
      failed: reservationCount - validReservations.length,
      blockchainTime: `${blockchainTime}ms`
    });

    // Cache the results
    setCache(userAddress, validReservations);
    
    const totalTime = Date.now() - startTime;
    devLog.log(`[${requestId}] ✅ Request completed successfully:`, {
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
    const extendedCache = getCache(userAddress);
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
      error: 'Failed to fetch user reservations',
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
    const { userAddress, clearCache = false } = body;
    
    if (!userAddress) {
      return Response.json({ 
        error: 'Missing userAddress parameter' 
      }, { status: 400 });
    }

    // Validate address format
    if (!isAddress(userAddress)) {
      return Response.json({ 
        error: 'Invalid userAddress format' 
      }, { status: 400 });
    }

    return await handleRequest(userAddress, clearCache);
    
  } catch (error) {
    devLog.error('getUserBookings: Request parsing error:', error);
    return Response.json({ 
      error: 'Invalid request format',
      message: error.message 
    }, { status: 400 });
  }
}

export async function GET(request) {
  const url = new URL(request.url);
  const userAddress = url.searchParams.get('userAddress');
  const clearCache = url.searchParams.get('clearCache') === 'true';
  
  if (!userAddress) {
    return Response.json({ 
      error: 'Missing userAddress parameter' 
    }, { status: 400 });
  }

  // Validate address format
  if (!isAddress(userAddress)) {
    return Response.json({ 
      error: 'Invalid userAddress format' 
    }, { status: 400 });
  }

  return await handleRequest(userAddress, clearCache);
}
