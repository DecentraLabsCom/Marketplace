/**
 * Request Deduplication System
 * Prevents redundant API calls and optimizes network usage
 */
import devLog from '@/utils/logger';

class RequestDeduplicator {
  constructor() {
    this.inFlightRequests = new Map();
    this.requestHistory = new Map();
    this.defaultTtl = 30000; // 30 seconds
  }

  /**
   * Create a unique key for a request
   */
  createRequestKey(url, options = {}) {
    const { method = 'GET', body, headers } = options;
    const keyData = {
      url,
      method,
      body: body ? JSON.stringify(body) : null,
      headers: headers ? JSON.stringify(headers) : null
    };
    
    return btoa(JSON.stringify(keyData));
  }

  /**
   * Deduplicated fetch with automatic caching
   */
  async fetch(url, options = {}, ttl = this.defaultTtl) {
    const requestKey = this.createRequestKey(url, options);
    
    // Check if we have a recent successful response
    const cachedResult = this.getFromHistory(requestKey, ttl);
    if (cachedResult) {
      devLog.log(`Request deduplication: cache hit for ${url}`);
      return cachedResult;
    }
    
    // Check if request is already in flight
    if (this.inFlightRequests.has(requestKey)) {
      devLog.log(`Request deduplication: joining in-flight request for ${url}`);
      return this.inFlightRequests.get(requestKey);
    }
    
    // Create new request
    const requestPromise = this.executeRequest(url, options, requestKey, ttl);
    this.inFlightRequests.set(requestKey, requestPromise);
    
    return requestPromise;
  }

  /**
   * Execute the actual request
   */
  async executeRequest(url, options, requestKey, ttl) {
    try {
      devLog.log(`Request deduplication: executing new request for ${url}`);
      
      const response = await fetch(url, options);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      // Parse JSON data
      const data = await response.json();
      
      // Create response-like object for consistency
      const responseObject = {
        ok: true,
        status: response.status,
        statusText: response.statusText,
        headers: new Headers(response.headers),
        json: () => Promise.resolve(data),
        clone: () => ({
          json: () => Promise.resolve(data)
        }),
        url: response.url
      };
      
      // Cache successful response
      this.addToHistory(requestKey, {
        ok: true,
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers.entries()),
        data,
        url: response.url
      }, ttl);
      
      // Clean up in-flight tracking
      this.inFlightRequests.delete(requestKey);
      
      // Return consistent response object
      return responseObject;
      
    } catch (error) {
      // Clean up in-flight tracking
      this.inFlightRequests.delete(requestKey);
      
      // Cache error for short time to prevent hammering
      this.addToHistory(requestKey, {
        ok: false,
        error: error.message,
        url
      }, Math.min(ttl, 5000)); // Max 5 seconds for errors
      
      throw error;
    }
  }

  /**
   * Get cached result from history
   */
  getFromHistory(requestKey, ttl) {
    const entry = this.requestHistory.get(requestKey);
    if (!entry) return null;
    
    const age = Date.now() - entry.timestamp;
    if (age >= ttl) {
      this.requestHistory.delete(requestKey);
      return null;
    }
    
    // Return cached response-like object
    if (entry.result.ok) {
      return {
        ok: true,
        status: entry.result.status,
        statusText: entry.result.statusText,
        headers: new Headers(entry.result.headers),
        json: () => Promise.resolve(entry.result.data),
        clone: () => ({
          json: () => Promise.resolve(entry.result.data)
        }),
        url: entry.result.url
      };
    } else {
      // Re-throw cached error
      throw new Error(entry.result.error);
    }
  }

  /**
   * Add result to history
   */
  addToHistory(requestKey, result, ttl) {
    this.requestHistory.set(requestKey, {
      result,
      timestamp: Date.now(),
      ttl
    });
    
    // Auto-cleanup after TTL
    setTimeout(() => {
      this.requestHistory.delete(requestKey);
    }, ttl);
  }

  /**
   * Clear all cached requests
   */
  clear() {
    this.inFlightRequests.clear();
    this.requestHistory.clear();
    devLog.log('Request deduplication cache cleared');
  }

  /**
   * Clear cached requests by URL pattern
   */
  clearByPattern(urlPattern) {
    const keysToDelete = [];
    
    for (const [key, entry] of this.requestHistory.entries()) {
      if (entry.result.url && entry.result.url.includes(urlPattern)) {
        keysToDelete.push(key);
      }
    }
    
    keysToDelete.forEach(key => this.requestHistory.delete(key));
    
    devLog.log(`Request deduplication: cleared ${keysToDelete.length} entries matching pattern: ${urlPattern}`);
  }

  /**
   * Get statistics about request deduplication
   */
  getStats() {
    return {
      inFlightRequests: this.inFlightRequests.size,
      cachedRequests: this.requestHistory.size,
      cacheHitRate: this.calculateHitRate()
    };
  }

  /**
   * Calculate cache hit rate (simplified)
   */
  calculateHitRate() {
    // This is a simplified implementation
    // In production, you'd want to track hits/misses more accurately
    const totalRequests = this.requestHistory.size + this.inFlightRequests.size;
    const cacheHits = this.requestHistory.size;
    
    if (totalRequests === 0) return 0;
    return Math.round((cacheHits / totalRequests) * 100);
  }

  /**
   * Cleanup expired entries
   */
  cleanup() {
    const now = Date.now();
    const keysToDelete = [];
    
    for (const [key, entry] of this.requestHistory.entries()) {
      const age = now - entry.timestamp;
      if (age >= entry.ttl) {
        keysToDelete.push(key);
      }
    }
    
    keysToDelete.forEach(key => this.requestHistory.delete(key));
    
    if (keysToDelete.length > 0) {
      devLog.log(`Request deduplication: cleaned up ${keysToDelete.length} expired entries`);
    }
  }
}

// Export singleton instance
export const requestDeduplicator = new RequestDeduplicator();

// Convenience function that matches fetch API
export const deduplicatedFetch = (url, options = {}, ttl = 30000) => {
  return requestDeduplicator.fetch(url, options, ttl);
};

// Auto-cleanup every 5 minutes
if (typeof window !== 'undefined') {
  setInterval(() => {
    requestDeduplicator.cleanup();
  }, 5 * 60 * 1000);
}
