// Shared cache module for reservations
// This allows cache invalidation across different API routes
// Enhanced with RPC saturation tolerance
import devLog from '@/utils/logger';

let reservationsCache = null;
let cacheTimestamp = null;
const CACHE_DURATION = 30000; // 30 seconds cache
const EMERGENCY_CACHE_DURATION = 600000; // 10 minutes during emergencies

export function getCache() {
  return {
    data: reservationsCache,
    timestamp: cacheTimestamp,
    duration: CACHE_DURATION,
    age: cacheTimestamp ? Date.now() - cacheTimestamp : null
  };
}

export function setCache(data) {
  reservationsCache = data;
  cacheTimestamp = Date.now();
  devLog.log('Cache updated with', data?.length || 0, 'reservations');
}

export function invalidateCache(reason = 'manual') {
  const hadCache = reservationsCache !== null;
  const cacheAge = hadCache ? Date.now() - cacheTimestamp : 0;
  
  reservationsCache = null;
  cacheTimestamp = null;
  
  if (hadCache) {
    devLog.log(`Cache invalidated: ${reason} (was ${Math.round(cacheAge/1000)}s old)`);
  }
  
  return hadCache;
}

export function isCacheValid() {
  if (!reservationsCache || !cacheTimestamp) {
    return false;
  }
  
  const now = Date.now();
  return (now - cacheTimestamp < CACHE_DURATION);
}

// Emergency cache functions for RPC saturation scenarios
export function isEmergencyCacheValid() {
  if (!reservationsCache || !cacheTimestamp) {
    return false;
  }
  
  const now = Date.now();
  return (now - cacheTimestamp < EMERGENCY_CACHE_DURATION);
}

export function getCacheStats() {
  return {
    hasCache: reservationsCache !== null,
    itemCount: reservationsCache?.length || 0,
    age: cacheTimestamp ? Date.now() - cacheTimestamp : null,
    isValid: isCacheValid(),
    isEmergencyValid: isEmergencyCacheValid(),
    lastUpdate: cacheTimestamp ? new Date(cacheTimestamp).toISOString() : null
  };
}
