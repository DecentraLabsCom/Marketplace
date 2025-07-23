/**
 * Unified Cache Management System
 * Atomic operations and consistent TTL strategy across all contexts
 */
import devLog from '@/utils/logger';

// Centralized cache durations
export const CACHE_TTL = {
  LABS: 12 * 60 * 60 * 1000,        // 12 hours
  BOOKINGS: 5 * 60 * 1000,          // 5 minutes  
  USER_STATUS: 15 * 60 * 1000,      // 15 minutes
  PROVIDER_STATUS: 10 * 60 * 1000,  // 10 minutes
  EMERGENCY: 60 * 60 * 1000,        // 1 hour (during RPC issues)
  SHORT: 2 * 60 * 1000,             // 2 minutes (for frequent updates)
  VERY_LONG: 24 * 60 * 60 * 1000    // 24 hours (for very stable data)
};

// Cache prefixes to avoid key collisions
export const CACHE_PREFIXES = {
  LABS: 'labs',
  BOOKINGS: 'bookings',
  USER: 'user',
  PROVIDER: 'provider',
  EMERGENCY: 'emergency'
};

class UnifiedCacheManager {
  constructor() {
    this.locks = new Map();
    this.requestQueues = new Map();
  }

  /**
   * Atomic write operation with lock mechanism
   */
  async atomicWrite(key, value) {
    // Wait for any existing lock on this key
    while (this.locks.has(key)) {
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    
    this.locks.set(key, true);
    try {
      sessionStorage.setItem(key, value);
    } finally {
      this.locks.delete(key);
    }
  }

  /**
   * Atomic read operation with lock awareness
   */
  async atomicRead(key) {
    // Wait for any existing write lock on this key
    while (this.locks.has(key)) {
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    
    try {
      return sessionStorage.getItem(key);
    } catch (error) {
      devLog.error(`Error reading from cache key ${key}:`, error);
      return null;
    }
  }

  /**
   * Get item from cache with TTL validation
   */
  async get(key, ttl = CACHE_TTL.LABS) {
    try {
      const item = await this.atomicRead(key);
      const timestamp = await this.atomicRead(`${key}_timestamp`);
      
      if (!item || !timestamp) {
        return null;
      }
      
      const age = Date.now() - parseInt(timestamp);
      if (age >= ttl) {
        // Cache expired - clean up
        await this.remove(key);
        return null;
      }
      
      return JSON.parse(item);
    } catch (error) {
      devLog.error(`Cache get error for key ${key}:`, error);
      return null;
    }
  }

  /**
   * Set item in cache with timestamp
   */
  async set(key, value, metadata = null) {
    try {
      const timestamp = Date.now().toString();
      
      await Promise.all([
        this.atomicWrite(key, JSON.stringify(value)),
        this.atomicWrite(`${key}_timestamp`, timestamp)
      ]);
      
      // Store metadata if provided
      if (metadata) {
        await this.atomicWrite(`${key}_metadata`, JSON.stringify(metadata));
      }
      
      devLog.log(`Cache set: ${key} (${JSON.stringify(value).length} bytes)`);
    } catch (error) {
      devLog.error(`Cache set error for key ${key}:`, error);
      throw error;
    }
  }

  /**
   * Remove item from cache atomically
   */
  async remove(key) {
    try {
      // Wait for any existing locks
      while (this.locks.has(key)) {
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      
      this.locks.set(key, true);
      try {
        sessionStorage.removeItem(key);
        sessionStorage.removeItem(`${key}_timestamp`);
        sessionStorage.removeItem(`${key}_metadata`);
      } finally {
        this.locks.delete(key);
      }
    } catch (error) {
      devLog.error(`Cache remove error for key ${key}:`, error);
    }
  }

  /**
   * Clear cache by prefix (e.g., all booking-related cache)
   */
  async clearByPrefix(prefix) {
    try {
      const keysToRemove = [];
      
      // Collect all keys with the prefix
      for (let i = 0; i < sessionStorage.length; i++) {
        const key = sessionStorage.key(i);
        if (key && key.startsWith(prefix)) {
          keysToRemove.push(key);
        }
      }
      
      // Remove all collected keys
      await Promise.all(keysToRemove.map(key => this.remove(key)));
      
      devLog.log(`Cache cleared by prefix: ${prefix} (${keysToRemove.length} items)`);
    } catch (error) {
      devLog.error(`Cache clear by prefix error for ${prefix}:`, error);
    }
  }

  /**
   * Get cache statistics
   */
  getStats() {
    try {
      const keys = [];
      let totalSize = 0;
      
      for (let i = 0; i < sessionStorage.length; i++) {
        const key = sessionStorage.key(i);
        if (key) {
          keys.push(key);
          const value = sessionStorage.getItem(key);
          if (value) {
            totalSize += value.length;
          }
        }
      }
      
      return {
        size: keys.length,
        keys,
        totalSize
      };
    } catch (error) {
      devLog.error('Cache stats error:', error);
      return { size: 0, keys: [], totalSize: 0 };
    }
  }

  /**
   * Check if cache is valid for a given key
   */
  async isValid(key, ttl = CACHE_TTL.LABS) {
    try {
      const timestamp = await this.atomicRead(`${key}_timestamp`);
      if (!timestamp) return false;
      
      const age = Date.now() - parseInt(timestamp);
      return age < ttl;
    } catch (error) {
      devLog.error(`Cache validity check error for ${key}:`, error);
      return false;
    }
  }

  /**
   * Get or set pattern - fetch from cache or execute function and cache result
   */
  async getOrSet(key, fetchFunction, ttl = CACHE_TTL.LABS) {
    // Try to get from cache first
    const cached = await this.get(key, ttl);
    if (cached !== null) {
      return cached;
    }
    
    // Check if there's already a request in flight for this key
    if (this.requestQueues.has(key)) {
      return this.requestQueues.get(key);
    }
    
    // Execute fetch function and cache result
    const promise = fetchFunction().then(async (result) => {
      await this.set(key, result, { ttl });
      this.requestQueues.delete(key);
      return result;
    }).catch((error) => {
      this.requestQueues.delete(key);
      throw error;
    });
    
    this.requestQueues.set(key, promise);
    return promise;
  }

  /**
   * Clean up expired cache entries
   */
  async cleanup() {
    try {
      const keysToRemove = [];
      
      for (let i = 0; i < sessionStorage.length; i++) {
        const key = sessionStorage.key(i);
        if (key && key.endsWith('_timestamp')) {
          const dataKey = key.replace('_timestamp', '');
          const timestamp = sessionStorage.getItem(key);
          
          if (timestamp) {
            const age = Date.now() - parseInt(timestamp);
            // Default cleanup after 1 hour
            if (age > 60 * 60 * 1000) {
              keysToRemove.push(dataKey);
            }
          }
        }
      }
      
      await Promise.all(keysToRemove.map(key => this.remove(key)));
      
      if (keysToRemove.length > 0) {
        devLog.log(`Cache cleanup: removed ${keysToRemove.length} expired items`);
      }
    } catch (error) {
      devLog.error('Cache cleanup error:', error);
    }
  }
}

// Export singleton instance
export const cacheManager = new UnifiedCacheManager();

// Auto-cleanup every 10 minutes
if (typeof window !== 'undefined') {
  setInterval(() => {
    cacheManager.cleanup();
  }, 10 * 60 * 1000);
}
