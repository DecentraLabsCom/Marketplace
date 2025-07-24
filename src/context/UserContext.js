"use client";
import { useState, useEffect, useCallback } from "react";
import { useAccount } from "wagmi";
import devLog from '@/utils/logger';
import { createOptimizedContext, useMemoizedValue, useDebounced } from '@/utils/optimizedContext';
import { cacheManager } from '@/utils/cacheManager';
import { 
  ErrorBoundary, 
  useErrorHandler, 
  createNetworkError, 
  ErrorSeverity,
  ErrorCategory 
} from '@/utils/errorBoundaries';

// Create optimized context with automatic memoization
const { Provider: OptimizedUserProvider, useContext: useUserContext } = createOptimizedContext('UserContext');

function UserDataCore({ children }) {
    const { address, isConnected } = useAccount();
    const { handleError: originalHandleError } = useErrorHandler();
    const [isSSO, setIsSSO] = useState(false);
    const [user, setUser] = useState(null);
    const [isProvider, setIsProvider] = useState(false);
    const [isProviderLoading, setIsProviderLoading] = useState(true);

    // Safe error handler wrapper
    const handleError = useCallback((error, context = {}) => {
        // Only handle truly invalid errors (null, undefined, or empty objects without message)
        if (!error) {
            const validError = new Error('Null or undefined error in UserContext');
            validError.originalError = error;
            validError.context = context;
            return originalHandleError(validError, context);
        }
        
        // If it's an object without message or name, but has other properties, let it through
        if (typeof error === 'object' && !error.message && !error.name && Object.keys(error).length === 0) {
            const validError = new Error('Empty error object in UserContext');
            validError.originalError = error;
            validError.context = context;
            return originalHandleError(validError, context);
        }
        
        // Pass through all other errors (including valid Error objects)
        return originalHandleError(error, context);
    }, [originalHandleError]);

    // Debounced address to prevent excessive API calls
    const debouncedAddress = useDebounced(address, 300);

    // Memoized login status
    const isLoggedIn = useMemoizedValue(() => isConnected || isSSO, [isConnected, isSSO]);

    // Optimistic state management for better UX
    useEffect(() => {
        if (isLoggedIn && debouncedAddress) {
            // Optimistically check cache for immediate UI updates
            const cachedStatus = cacheManager.get(`provider_status_${debouncedAddress}_false`);
            const cachedName = cacheManager.get(`provider_name_${debouncedAddress}`);
            
            if (cachedStatus?.isLabProvider !== undefined) {
                setIsProvider(Boolean(cachedStatus.isLabProvider));
                
                // Set basic user object immediately if we have cache
                setUser(prev => {
                    if (!prev || prev.address !== debouncedAddress) {
                        return {
                            address: debouncedAddress,
                            name: cachedName?.name || null
                        };
                    }
                    return prev;
                });
                
                // If we have complete cache, reduce loading time perception
                if (cachedName?.name !== undefined) {
                    setIsProviderLoading(false);
                }
            }
        } else if (!isLoggedIn) {
            // Clear state immediately when logged out
            setIsProvider(false);
            setUser(null);
            setIsProviderLoading(false);
        }
    }, [isLoggedIn, debouncedAddress]);

    // Retry utility with exponential backoff
    const retryWithBackoff = useCallback(async (fn, maxRetries = 3, baseDelay = 1000) => {
        for (let attempt = 0; attempt < maxRetries; attempt++) {
            try {
                return await fn();
            } catch (error) {
                if (attempt === maxRetries - 1) throw error;
                
                // Don't retry on certain HTTP errors
                if (error.status === 401 || error.status === 403) throw error;
                
                const delay = baseDelay * Math.pow(2, attempt);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }, []);

    // Enhanced fetch functions with error handling and caching
    const fetchSSOSession = useCallback(async () => {
        try {
            // Check cache first
            const cached = cacheManager.get('sso_session');
            if (cached) {
                devLog.log('🔄 UserContext: fetchSSOSession - Using CACHE (no API call)');
                return cached;
            }

            devLog.warn('🚨 UserContext: fetchSSOSession - Making API CALL to /api/auth/sso/session');
            const response = await fetch('/api/auth/sso/session', { 
                method: 'GET' 
            });

            if (!response.ok) {
                throw createNetworkError("Failed to fetch SSO session", {
                    status: response.status,
                    statusText: response.statusText
                });
            }

            const data = await response.json();
            
            // Cache the result if valid
            if (data?.user) {
                cacheManager.set('sso_session', data, 30000); // 30 seconds
            }
            
            return data;
        } catch (error) {
            handleError(error, { 
                context: 'fetchSSOSession',
                severity: ErrorSeverity.MEDIUM,
                category: ErrorCategory.AUTHENTICATION
            });
            throw error;
        }
    }, [handleError]);

    const fetchProviderStatus = useCallback(async (identifier, isEmail = false) => {
        return retryWithBackoff(async () => {
            // Create cache key
            const cacheKey = `provider_status_${identifier}_${isEmail}`;
            
            // Check cache first
            const cached = cacheManager.get(cacheKey);
            if (cached && cached.isLabProvider !== undefined) {
                devLog.log(`🔄 UserContext: fetchProviderStatus(${identifier}) - Using CACHE (no API call)`);
                return cached;
            }

            const endpoint = isEmail ? 
                '/api/contract/provider/isSSOProvider' : 
                '/api/contract/provider/isLabProvider';

            devLog.warn(`🚨 UserContext: fetchProviderStatus(${identifier}) - Making API CALL to ${endpoint}`);
            
            try {
                const body = isEmail ? 
                    { email: identifier } : 
                    { wallet: identifier };

                const response = await fetch(endpoint, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(body)
                });

                if (!response.ok) {
                    if (response.status === 404) {
                        devLog.log(`ℹ️ UserContext: fetchProviderStatus(${identifier}) - Not a provider (404), caching false result`);
                        // Cache 404s for provider status too
                        const result = { isLabProvider: false };
                        cacheManager.set(cacheKey, result, 300000); // Cache 404s for 5 minutes
                        return result;
                    }
                    throw createNetworkError("Failed to fetch provider status", {
                        status: response.status,
                        identifier,
                        isEmail
                    });
                }

                const data = await response.json();
                
                // Ensure we always have the expected structure
                const result = {
                    isLabProvider: Boolean(data?.isLabProvider || false),
                    ...data
                };
                
                devLog.log(`✅ UserContext: fetchProviderStatus(${identifier}) - isLabProvider: ${result.isLabProvider}`);
                
                // Cache the result
                cacheManager.set(cacheKey, result, 300000); // 5 minutes (same as name cache)
                
                return result;
            } catch (fetchError) {
                // Handle fetch-level errors (network, etc.)
                devLog.warn(`⚠️ UserContext: fetchProviderStatus(${identifier}) - Fetch error:`, fetchError.message);
                throw fetchError;
            }
        }, 3, 1000).catch(error => {
            // Only log actual errors, not expected 404s
            if (!error.message?.includes('404')) {
                handleError(error, {
                    context: 'fetchProviderStatus',
                    identifier,
                    isEmail,
                    severity: ErrorSeverity.MEDIUM,
                    category: ErrorCategory.BLOCKCHAIN
                });
            }
            
            // Return default structure instead of throwing
            return { isLabProvider: false };
        });
    }, [handleError, retryWithBackoff]);

    const fetchProviderName = useCallback(async (wallet) => {
        return retryWithBackoff(async () => {
            // Create cache key
            const cacheKey = `provider_name_${wallet}`;
            
            // Check cache first
            const cached = cacheManager.get(cacheKey);
            if (cached && cached.name !== undefined) {
                devLog.log(`🔄 UserContext: fetchProviderName(${wallet}) - Using CACHE (no API call)`);
                return cached;
            }

            devLog.warn(`🚨 UserContext: fetchProviderName(${wallet}) - Making API CALL to /api/contract/provider/getLabProviderName`);
            
            try {
                const response = await fetch('/api/contract/provider/getLabProviderName', {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ wallet })
                });

                if (!response.ok) {
                    if (response.status === 404) {
                        devLog.log(`ℹ️ UserContext: fetchProviderName(${wallet}) - Provider not found (404), caching null result`);
                        const result = { name: null };
                        cacheManager.set(cacheKey, result, 60000); // Cache 404s for 1 minute
                        return result;
                    }
                    throw createNetworkError("Failed to fetch provider name", {
                        status: response.status,
                        wallet
                    });
                }

                const data = await response.json();
                
                // Ensure we always have the expected structure
                const result = {
                    name: data?.name || null,
                    ...data
                };
                
                devLog.log(`✅ UserContext: fetchProviderName(${wallet}) - Found name: ${result.name}`);
                
                // Cache the result
                cacheManager.set(cacheKey, result, 300000); // 5 minutes
                
                return result;
            } catch (fetchError) {
                // Handle fetch-level errors (network, etc.)
                devLog.warn(`⚠️ UserContext: fetchProviderName(${wallet}) - Fetch error:`, fetchError.message);
                throw fetchError;
            }
        }, 3, 1000).catch(error => {
            // Only log actual errors, not expected 404s
            if (!error.message?.includes('404')) {
                handleError(error, {
                    context: 'fetchProviderName',
                    wallet,
                    severity: ErrorSeverity.LOW,
                    category: ErrorCategory.NETWORK
                });
            }
            
            // Return default structure instead of throwing
            return { name: null };
        });
    }, [handleError, retryWithBackoff]);

    // Check SSO session on mount
    useEffect(() => {
        let mounted = true;

        const checkSSOSession = async () => {
            try {
                const data = await fetchSSOSession();
                
                if (mounted && data?.user) {
                    setIsSSO(true);
                    setUser(data.user);
                    setIsProviderLoading(false);
                }
            } catch {
                if (mounted) {
                    setIsProviderLoading(false);
                }
                // Error already handled in fetchSSOSession
            }
        };

        checkSSOSession();

        return () => {
            mounted = false;
        };
    }, [fetchSSOSession]);

    // Check provider status when login state changes
    useEffect(() => {
        devLog.warn('🔥 UserContext: Provider status useEffect TRIGGERED - This could cause API calls');
        let mounted = true;
        let currentRequest = null;

        const checkProviderStatus = async () => {
            
            if (!isLoggedIn) {
                setIsProvider(false);
                setIsProviderLoading(false);
                setUser(null);
                return;
            }

            // Prevent multiple concurrent requests for the same identifier
            const requestId = isSSO ? `sso_${user?.email}` : `wallet_${debouncedAddress}`;
            if (currentRequest === requestId) {
                return;
            }
            currentRequest = requestId;

            // For wallet users, check cache first - if we have data, show it immediately
            if (debouncedAddress && !isSSO) {
                const cachedStatus = cacheManager.get(`provider_status_${debouncedAddress}_false`);
                const cachedName = cacheManager.get(`provider_name_${debouncedAddress}`);
                
                if (cachedStatus?.isLabProvider !== undefined) {
                    setIsProvider(Boolean(cachedStatus.isLabProvider));
                    
                    // Only stop loading if we have BOTH status and name
                    if (cachedName?.name !== undefined) {
                        setIsProviderLoading(false);
                        setUser(prev => ({
                            ...prev,
                            address: debouncedAddress,
                            name: cachedName.name
                        }));
                    } else {
                        // We have status but no name - continue loading for name
                        setUser(prev => ({
                            ...prev,
                            address: debouncedAddress,
                            name: null
                        }));
                    }
                } else if (cachedName?.name !== undefined) {
                    // We have name but no status - show name but continue loading for status
                    setUser(prev => ({
                        ...prev,
                        address: debouncedAddress,
                        name: cachedName.name
                    }));
                }
            }

            // Only set loading if we don't have cache and this is the first request
            const shouldShowLoading = (!isSSO && !cacheManager.get(`provider_status_${debouncedAddress}_false`)) ||
                                    (isSSO && !user);
            
            if (shouldShowLoading) {
                setIsProviderLoading(true);
            }

            try {
                if (isSSO && user?.email) {
                    // SSO user - check by email
                    const data = await fetchProviderStatus(user.email, true);
                    
                    if (mounted && data) {
                        setIsProvider(Boolean(data.isLabProvider));
                    }
                } else if (debouncedAddress) {
                    // Wallet user - parallel calls for better UX, each handles its own errors
                    const [statusResult, nameResult] = await Promise.allSettled([
                        fetchProviderStatus(debouncedAddress, false),
                        fetchProviderName(debouncedAddress)
                    ]);
                    
                    if (mounted) {
                        // Handle provider status
                        const isProviderStatus = statusResult.status === 'fulfilled' ? 
                            Boolean(statusResult.value?.isLabProvider) : false;
                        setIsProvider(isProviderStatus);
                        
                        // Handle provider name (optimistically try to get it)
                        const providerName = nameResult.status === 'fulfilled' ? 
                            (nameResult.value?.name || null) : null;
                        
                        setUser(prev => {
                            const currentName = prev?.name || null;
                            
                            // Only update if name actually changed or we don't have a user object
                            if (providerName !== currentName || !prev) {
                                const newUser = { 
                                    ...prev, 
                                    name: providerName,
                                    address: debouncedAddress 
                                };
                                return newUser;
                            }
                            
                            // Ensure address is set
                            if (prev && prev.address !== debouncedAddress) {
                                return { ...prev, address: debouncedAddress };
                            }
                            
                            return prev;
                        });
                    }
                }
            } catch {
                // Ensure we still have a basic user object for wallets
                if (mounted && debouncedAddress && !isSSO) {
                    setUser(prev => {
                        if (!prev) {
                            return { 
                                address: debouncedAddress, 
                                name: null 
                            };
                        }
                        return prev;
                    });
                    setIsProvider(false);
                }
            } finally {
                currentRequest = null;
                if (mounted) {
                    setIsProviderLoading(false);
                }
            }
        };

        checkProviderStatus();

        return () => {
            mounted = false;
            currentRequest = null;
        };
    }, [isLoggedIn, debouncedAddress, user?.email, isSSO, user, fetchProviderStatus, fetchProviderName]);

    // Refresh function with cache invalidation
    const refreshProviderStatus = useCallback(async () => {
        if (!isLoggedIn) return;

        setIsProviderLoading(true);

        try {
            if (isSSO && user?.email) {
                // Clear cache first
                cacheManager.remove(`provider_status_${user.email}_true`);
                
                const data = await fetchProviderStatus(user.email, true);
                setIsProvider(Boolean(data?.isLabProvider));
            } else if (address) {
                // Clear caches first
                cacheManager.remove(`provider_status_${address}_false`);
                cacheManager.remove(`provider_name_${address}`);
                
                // Parallel calls for better UX
                const [statusResult, nameResult] = await Promise.allSettled([
                    fetchProviderStatus(address, false),
                    fetchProviderName(address)
                ]);
                
                const isProviderStatus = statusResult.status === 'fulfilled' ? 
                    Boolean(statusResult.value?.isLabProvider) : false;
                setIsProvider(isProviderStatus);
                
                const providerName = nameResult.status === 'fulfilled' ? 
                    (nameResult.value?.name || null) : null;
                
                setUser(prev => ({
                    ...prev,
                    name: providerName,
                    address: address
                }));
            }
        } catch {
            // Error already handled in fetch functions
        }

        setIsProviderLoading(false);
    }, [isLoggedIn, isSSO, user?.email, address, fetchProviderStatus, fetchProviderName]);

    // Auto-refresh mechanism for missing data (moved after refreshProviderStatus definition)
    useEffect(() => {
        let autoRefreshTimer;

        const needsDataRefresh = () => {
            // If we're connected but don't have complete provider info after 5 seconds
            return isLoggedIn && 
                   !isProviderLoading && 
                   debouncedAddress && 
                   !isSSO && 
                   (!user || user.name === undefined || isProvider === undefined);
        };

        if (needsDataRefresh()) {
            autoRefreshTimer = setTimeout(() => {
                if (needsDataRefresh()) {
                    devLog.log('Auto-refreshing missing provider data');
                    refreshProviderStatus();
                }
            }, 2000); // Wait 2 seconds before auto-refresh (reduced from 5)
        }

        return () => {
            if (autoRefreshTimer) {
                clearTimeout(autoRefreshTimer);
            }
        };
    }, [isLoggedIn, isProviderLoading, debouncedAddress, isSSO, user, isProvider, refreshProviderStatus]);

    // Address change detection - force refresh if we get a new address
    useEffect(() => {
        if (isLoggedIn && debouncedAddress && !isSSO && !isProviderLoading) {
            // Check if the current user object matches the address
            const addressMismatch = user && user.address && user.address !== debouncedAddress;
            const missingData = !user || isProvider === undefined;
            
            if (addressMismatch || missingData) {
                devLog.log('Address change or missing data detected, refreshing provider status');
                refreshProviderStatus();
            }
        }
    }, [debouncedAddress, isLoggedIn, isSSO, user, isProvider, isProviderLoading, refreshProviderStatus]);

    // Helper to detect incomplete data state
    const hasIncompleteData = useMemoizedValue(() => {
        if (!isLoggedIn || isSSO) return false;
        
        // For wallet users, we should have basic user object and provider status
        return !user || 
               user.address !== debouncedAddress || 
               (isProvider && user.name === undefined);
    }, [isLoggedIn, isSSO, user, debouncedAddress, isProvider]);

    // Memoized context value
    const contextValue = useMemoizedValue(() => {
        const value = {
            address: address ?? null,
            isConnected: !!isConnected,
            isSSO,
            user,
            isLoggedIn: !!isConnected || isSSO,
            isProvider,
            isProviderLoading,
            hasIncompleteData,
            refreshProviderStatus
        };
        
        return value;
    }, [
        address,
        isConnected,
        isSSO,
        user,
        isProvider,
        isProviderLoading,
        hasIncompleteData,
        refreshProviderStatus
    ]);

    return (
        <OptimizedUserProvider value={contextValue}>
            {children}
        </OptimizedUserProvider>
    );
}

// Wrap with Error Boundary
export function UserData({ children }) {
    return (
        <ErrorBoundary
            name="UserDataProvider"
            severity={ErrorSeverity.HIGH}
            category={ErrorCategory.AUTHENTICATION}
            userMessage="Authentication system error. Please refresh the page."
            fallback={() => (
                <div className="p-4 bg-yellow-50 border border-yellow-200 rounded">
                    <h3 className="font-semibold text-yellow-800">Authentication Error</h3>
                    <p className="text-yellow-700 mt-1">
                        Please refresh the page to restore authentication functionality.
                    </p>
                    <button 
                        onClick={() => window.location.reload()}
                        className="mt-2 px-3 py-1 bg-yellow-600 text-white rounded text-sm hover:bg-yellow-700"
                    >
                        Refresh Page
                    </button>
                </div>
            )}
        >
            <UserDataCore>{children}</UserDataCore>
        </ErrorBoundary>
    );
}

export function useUser() {
    const ctx = useUserContext();
    if (!ctx) throw new Error("useUser must be used within a UserData provider");
    return ctx;
}
