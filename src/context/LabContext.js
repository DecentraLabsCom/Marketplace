'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { 
  createBlockchainError, 
  ErrorSeverity, 
  ErrorCategory,
  ErrorBoundary 
} from '@/utils/errorBoundaries';
import { deduplicatedFetch } from '@/utils/requestDeduplication';
import { cacheManager, CACHE_TTL } from '@/utils/cacheManager';
import { createOptimizedContext } from '@/utils/optimizedContext';
import devLog from '@/utils/logger';

// Cache configuration
const CACHE_KEYS = {
  LABS: 'labs_data',
  LABS_TIMESTAMP: 'labs_timestamp',
};

// Create optimized context
const { Provider: OptimizedLabProvider, useContext: useLabContext } = createOptimizedContext('LabContext');

// Core lab data provider without bookings logic
function LabDataCore({ children }) {
  devLog.log('LabContext: LabDataCore component initialized');
  const [labs, setLabsState] = useState([]);
  const [isLoading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [lastFetch, setLastFetch] = useState(0);

  // Enhanced setLabs that also updates cache
  const setLabs = useCallback((newLabs) => {
    if (typeof newLabs === 'function') {
      setLabsState(prevLabs => {
        const updatedLabs = newLabs(prevLabs);
        // Update cache whenever labs are modified
        cacheManager.set(CACHE_KEYS.LABS, updatedLabs, CACHE_TTL.LABS);
        return updatedLabs;
      });
    } else {
      setLabsState(newLabs);
      // Update cache whenever labs are modified
      cacheManager.set(CACHE_KEYS.LABS, newLabs, CACHE_TTL.LABS);
    }
  }, []);

  // Enhanced error handling
  const handleError = useCallback((error, context = {}) => {
    devLog.error('LabContext: Error occurred:', error, context);
    setError({
      message: error.message,
      code: error.code,
      context,
      timestamp: new Date(),
    });
  }, []);

  // Enhanced fetchLabs with better caching and deduplication
  const fetchLabs = useCallback(async (force = false) => {
    try {
      // Prevent redundant calls
      const now = Date.now();
      if (!force && isLoading) {
        devLog.log('LabContext: Fetch already in progress, skipping...');
        return labs;
      }
      
      // Check if we recently fetched (debounce)
      if (!force && lastFetch && (now - lastFetch < 5000)) { // 5 second debounce
        devLog.log('LabContext: Fetch debounced (5s), using current data');
        return labs;
      }

      setLoading(true);
      setError(null);
      setLastFetch(now);

      // Try cache first unless forced
      if (!force) {
        const cached = cacheManager.get(CACHE_KEYS.LABS);
        if (cached && Array.isArray(cached)) {
          devLog.log('LabContext: Labs cache hit', `${cached.length} labs`);
          setLabs(cached);
          setLoading(false);
          setIsInitialized(true);
          return cached;
        }
      }

      devLog.log('LabContext: Fetching labs from API...', { force });
      
      const response = await deduplicatedFetch('/api/contract/lab/getAllLabs', {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      }, force ? 0 : 300000); // 5 minutes cache unless forced

      devLog.log('LabContext: Response received', { ok: response.ok, status: response.status });

      if (!response.ok) {
        throw createBlockchainError(`HTTP ${response.status}: ${response.statusText}`, {
          status: response.status,
          context: 'fetchLabs'
        });
      }

      const data = await response.json();
      devLog.log('LabContext: Data parsed', { dataType: typeof data, isArray: Array.isArray(data), length: data?.length });
      
      // Validate that we got an array
      if (!Array.isArray(data)) {
        throw createBlockchainError('Invalid labs data received', {
          receivedType: typeof data,
          context: 'fetchLabs'
        });
      }

      // Initialize booking arrays for each lab (empty since bookings are handled separately)
      const labsWithBookingStructure = data.map(lab => ({
        ...lab,
        bookingInfo: [], // Will be populated by BookingContext
        userBookings: [], // Will be populated by BookingContext
      }));

      devLog.log('LabContext: Labs processed', { count: labsWithBookingStructure.length });

      // Cache the labs
      cacheManager.set(CACHE_KEYS.LABS, labsWithBookingStructure, CACHE_TTL.LABS);
      
      const cacheInfo = response.headers.get('X-Cache') || 'UNKNOWN';
      devLog.log(`Fetched ${labsWithBookingStructure.length} labs (Cache: ${cacheInfo})`);
      
      setLabs(labsWithBookingStructure);
      setIsInitialized(true);
      devLog.log('LabContext: State updated with labs');
      return labsWithBookingStructure;

    } catch (err) {
      devLog.error('LabContext: fetchLabs error:', err);
      handleError(err, {
        context: 'fetchLabs',
        force,
        severity: ErrorSeverity.MEDIUM,
        category: ErrorCategory.BLOCKCHAIN
      });
      
      // Try to use cached data as fallback
      const cached = cacheManager.get(CACHE_KEYS.LABS, true); // Allow stale
      if (cached && Array.isArray(cached)) {
        devLog.warn('Using stale labs cache due to error');
        setLabs(cached);
        return cached;
      }
      
      throw err;
    } finally {
      setLoading(false);
    }
  }, [handleError]);

  // Initial load effect - optimized to prevent redundant calls
  useEffect(() => {
    devLog.log('LabContext: useEffect triggered - initializing labs');
    let mounted = true;

    const initializeLabs = async () => {
      try {
        // Skip if already initialized and has data
        if (isInitialized && labs.length > 0) {
          devLog.log('LabContext: Already initialized with data, skipping');
          return;
        }

        devLog.log('LabContext: initializeLabs function called');
        // Check cache first
        const cached = cacheManager.get(CACHE_KEYS.LABS);
        if (cached && Array.isArray(cached)) {
          devLog.log('LabContext: Loading labs from cache immediately', { count: cached.length });
          setLabs(cached);
          setIsInitialized(true);
        } else {
          devLog.log('LabContext: No cache found, will fetch fresh data');
        }
        
        // Always fetch fresh data if mounted and not already loading
        if (mounted && !isLoading) {
          devLog.log('LabContext: Component is mounted, calling fetchLabs()');
          await fetchLabs();
          devLog.log('LabContext: fetchLabs() completed successfully');
        } else {
          devLog.log('LabContext: Component unmounted or already loading, skipping fetchLabs()');
        }
      } catch (error) {
        devLog.error('LabContext: Error in initializeLabs:', error);
      }
    };

    devLog.log('LabContext: About to call initializeLabs()');
    initializeLabs();

    return () => {
      devLog.log('LabContext: useEffect cleanup - setting mounted to false');
      mounted = false;
    };
  }, []); // Remove fetchLabs dependency to prevent re-runs

  // Smart refresh effect - background refresh of stale cache
  useEffect(() => {
    let smartRefreshTimer;

    try {
      // Smart refresh logic: if cache is older than 1 hour, refresh in background
      const shouldSmartRefresh = () => {
        try {
          const timestamp = cacheManager.get(CACHE_KEYS.LABS_TIMESTAMP);
          if (!timestamp) return false;
          
          const now = Date.now();
          const cacheAge = now - timestamp;
          const oneHour = 60 * 60 * 1000;
          
          return cacheAge > oneHour;
        } catch (error) {
          devLog.error('LabContext: Error in shouldSmartRefresh:', error);
          return false;
        }
      };

      if (shouldSmartRefresh()) {
        smartRefreshTimer = setTimeout(() => {
          try {
            if (shouldSmartRefresh()) {
              devLog.log('Smart refresh: Cache is older than 1 hour, refreshing labs in background');
              fetchLabs(true);
            }
          } catch (error) {
            devLog.error('LabContext: Error in smart refresh timer:', error);
          }
        }, 3000);
      }
    } catch (error) {
      devLog.error('LabContext: Error in smart refresh effect:', error);
    }

    return () => {
      if (smartRefreshTimer) {
        clearTimeout(smartRefreshTimer);
      }
    };
  }, [labs, fetchLabs]);

  // Update lab in state
  const updateLabInState = useCallback((labId, updates) => {
    setLabs((prevLabs) => {
      const updatedLabs = prevLabs.map((lab) => {
        if (lab.id === labId) {
          return { ...lab, ...updates };
        }
        return lab;
      });
      
      // Cache is automatically updated by setLabs
      return updatedLabs;
    });
  }, [setLabs]);

  // Smart cache management
  const clearCacheAndRefresh = useCallback(async () => {
    try {
      await cacheManager.remove(CACHE_KEYS.LABS);
      await cacheManager.remove(CACHE_KEYS.LABS_TIMESTAMP);
      fetchLabs(true);
    } catch (error) {
      devLog.error('LabContext: Error clearing cache:', error);
      // If cache clearing fails, still try to refresh
      fetchLabs(true);
    }
  }, [fetchLabs]);

  // Context value
  const value = {
    labs,
    setLabs, // Add setLabs for direct state manipulation
    loading: isLoading,
    error,
    fetchLabs,
    clearCacheAndRefresh,
    updateLabInState,
    forceRefreshLabs: () => fetchLabs(true),
  };

  return (
    <OptimizedLabProvider value={value}>
      {children}
    </OptimizedLabProvider>
  );
}

// Wrap with Error Boundary
export function LabData({ children }) {
  return (
    <ErrorBoundary
      name="LabDataProvider"
      severity={ErrorSeverity.HIGH}
      category={ErrorCategory.BUSINESS_LOGIC}
      userMessage="Lab data system error. Please refresh the page."
      fallback={() => (
        <div className="p-6 bg-red-50 border border-red-200 rounded-lg">
          <h3 className="font-semibold text-red-800">Lab Data Error</h3>
          <p className="text-red-700 mt-1">
            Unable to load lab data. Please refresh the page.
          </p>
          <button 
            onClick={() => window.location.reload()}
            className="mt-3 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
          >
            Refresh Page
          </button>
        </div>
      )}
    >
      <LabDataCore>{children}</LabDataCore>
    </ErrorBoundary>
  );
}

export function useLabs() {
  const context = useLabContext();
  if (!context) {
    throw new Error('useLabs must be used within a LabData');
  }
  // Ensure labs is always an array, even during loading
  return {
    ...context,
    labs: Array.isArray(context.labs) ? context.labs : []
  };
}

// For backwards compatibility
export const LabProvider = LabData;
