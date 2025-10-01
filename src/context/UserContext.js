"use client";
import { useState, useEffect, useCallback } from 'react'
import PropTypes from 'prop-types'
import { useAccount } from 'wagmi'
import { useQueryClient } from '@tanstack/react-query'
import { 
  useSSOSessionQuery, 
  useIsLabProviderQuery, 
  useGetLabProvidersQuery, 
  useRefreshProviderStatusMutation 
} from '@/hooks/user/useUsers'
import { userQueryKeys, providerQueryKeys } from '@/utils/hooks/queryKeys'
import { 
  ErrorBoundary, 
  useErrorHandler, 
  ErrorSeverity,
  ErrorCategory 
} from '@/utils/errorBoundaries'
import { createOptimizedContext } from '@/utils/optimizedContext'
import devLog from '@/utils/dev/logger'

// Create optimized context with automatic memoization
const { Provider: OptimizedUserProvider, useContext: useUserContext } = createOptimizedContext('UserContext');

/**
 * Get the institution display name from SAML attributes
 * @param {Object} userData - User data from SAML assertion
 * @returns {string} Institution identifier (e.g., "UNED" from organizationName or "uned.es" -> "UNED" from affiliation)
 */
function getInstitutionName(userData) {
    // First priority: use organizationName if available (more direct)
    if (userData.organizationName) {
        return userData.organizationName.toUpperCase();
    }
    
    // Fallback: extract from affiliation domain
    if (userData.affiliation) {
        return userData.affiliation.split('.')[0].toUpperCase();
    }
    
    return null;
}

/**
 * Core user data provider component with React Query integration
 * Manages user state, SSO authentication, and provider status
 * @param {Object} props
 * @param {React.ReactNode} props.children - Child components to wrap with user context
 * @returns {JSX.Element} Provider with user data and authentication state
 */
function UserDataCore({ children }) {
    const { address, isConnected, isReconnecting, isConnecting } = useAccount();
    const queryClient = useQueryClient();
    const { handleError: originalHandleError } = useErrorHandler();
    const [isSSO, setIsSSO] = useState(false);
    const [user, setUser] = useState(null);
    const [isLoggingOut, setIsLoggingOut] = useState(false);

    // Track initial connection state to prevent flash of authenticated content
    const isWalletLoading = isReconnecting || isConnecting;

    // React Query hooks for data fetching
    const { 
        data: ssoData, 
        isLoading: ssoLoading,
        error: ssoError,
        refetch: refetchSSO
    } = useSSOSessionQuery({
        enabled: !isWalletLoading && !isLoggingOut, // Disable completely during logout
        refetchOnWindowFocus: !isLoggingOut, // Disable window focus refetch during logout
        refetchInterval: isLoggingOut ? false : 30000, // Disable interval during logout
        retry: isLoggingOut ? false : 1, // Disable retries during logout
    });

    // Handle SSO login callback - force immediate refetch when returning from IdP
    useEffect(() => {
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('sso_login') === '1') {
            // Clear the URL parameter
            const newUrl = new URL(window.location);
            newUrl.searchParams.delete('sso_login');
            window.history.replaceState({}, '', newUrl);
            
            // Force immediate refetch of SSO session data
            refetchSSO();
        }
    }, [queryClient, refetchSSO]);

    const { 
        data: providerStatus, 
        isLoading: isProviderLoading,
        error: providerError 
    } = useIsLabProviderQuery(address, {
        enabled: Boolean(address) && !isWalletLoading, // Only fetch when wallet connection is stable
        retry: false, // Don't retry failed provider status queries
    });

    // Get provider details only if user is a provider
    const { 
        data: providersData,
        isLoading: isProvidersLoading 
    } = useGetLabProvidersQuery({
        enabled: Boolean(providerStatus?.isLabProvider), // Only fetch if user is confirmed provider
        staleTime: 10 * 60 * 1000, // 10 minutes for provider list
    });

    // Debug logging for provider status
    const refreshProviderStatusMutation = useRefreshProviderStatusMutation();

    // Safe error handler wrapper
    const handleError = useCallback((error, context = {}) => {
        // Skip null/undefined errors
        if (!error) {
            return;
        }

        // Skip empty error objects (common with React Query in certain scenarios)
        if (typeof error === 'object' && Object.keys(error).length === 0) {
            return;
        }

        // Skip errors that are just empty strings or meaningless
        if (typeof error === 'string' && error.trim() === '') {
            return;
        }

        // For React Query errors, check if there's meaningful content
        if (error && typeof error === 'object') {
            const hasMessage = error.message && error.message.trim().length > 0;
            const hasName = error.name && error.name.trim().length > 0;
            const hasCode = error.code !== undefined;
            const hasResponse = error.response !== undefined;
            
            // If it's an object but has no meaningful error information, skip it
            if (!hasMessage && !hasName && !hasCode && !hasResponse) {
                return;
            }
        }

        // If we get here, it's a legitimate error worth reporting
        originalHandleError(error, context);
    }, [originalHandleError]);

    // Computed values
    const isProvider = Boolean(providerStatus?.isLabProvider);
    const isLoggedIn = (isConnected && Boolean(address) && !isWalletLoading) || (isSSO && Boolean(user));
    const hasIncompleteData = isLoggedIn && (isProviderLoading || ssoLoading);
    
    // Combined loading state - don't wait for providers list for basic functionality
    const isLoading = isWalletLoading || (isConnected && (isProviderLoading || ssoLoading));

    // Combined effect to handle both SSO and provider data with proper name priority
    useEffect(() => {
        // Only log during important state changes for cleaner debugging
        const hasSSO = ssoData && (ssoData.user || ssoData.isSSO === false);
        if (isLoggingOut || hasSSO) {
            devLog.log('📊 UserContext useEffect triggered:', {
                isLoggingOut,
                ssoData: ssoData ? { hasUser: !!ssoData.user, isSSO: ssoData.isSSO } : null,
                address,
                hasProviderStatus: !!providerStatus
            });
        }
        
        // Don't update state during logout process
        if (isLoggingOut) {
            devLog.log('🚫 Skipping useEffect - logout in progress');
            return;
        }
        
        let updatedUser = {};
        let shouldUpdate = false;

        // Handle SSO session data - this should work even without wallet connection
        if (ssoData) {
            devLog.log('🔑 Processing SSO data:', ssoData);
            setIsSSO(Boolean(ssoData.isSSO));
            
            if (ssoData.user) {
                updatedUser = {
                    ...updatedUser,
                    ...ssoData.user,
                    // Use the best available institution name from SAML attributes
                    institutionName: getInstitutionName(ssoData.user),
                    address: address || updatedUser.address
                };
                shouldUpdate = true;
                devLog.log('👤 Will update user with SSO data');
            } else if (ssoData.isSSO === false || ssoData.user === null) {
                devLog.log('🚪 SSO data indicates logout or no SSO session');
                setIsSSO(false);
                // Only clear user data if we don't have a wallet connected
                // If wallet is connected, let the wallet data processing handle the user state
                if (!address) {
                    devLog.log('🚪 No wallet connected, clearing user state');
                    setUser(null);
                    return;
                }
            }
        }

        // Handle provider data only when wallet is connected
        if (address && providerStatus) {
            updatedUser = {
                ...updatedUser,
                address,
                isProvider: providerStatus.isLabProvider
            };
            
            // Get provider name from providers list if available
            if (providerStatus.isLabProvider && providersData?.providers) {
                const providerInfo = providersData.providers.find(p => 
                    p.account?.toLowerCase() === address.toLowerCase()
                );
                if (providerInfo?.name) {
                    updatedUser.name = providerInfo.name;
                }
            }
            
            // If no provider name and SSO name available, use SSO name as fallback
            if (!updatedUser.name && ssoData?.user?.name) {
                updatedUser.name = ssoData.user.name;
            }
            
            shouldUpdate = true;
        }

        // If we have SSO data but no wallet connection, still update the user
        if (ssoData?.user && !address) {
            updatedUser = {
                ...ssoData.user,
                // Use the best available institution name from SAML attributes
                institutionName: getInstitutionName(ssoData.user),
                isProvider: false, // SSO users without wallet can't be providers
            };
            shouldUpdate = true;
        }

        // Update user state only if there are changes
        if (shouldUpdate) {
            setUser(prev => ({
                ...prev,
                ...updatedUser
            }));
        }
    }, [ssoData, address, providerStatus, providersData, isLoggingOut]);

    // Handle connection changes - only clear wallet-related data, preserve SSO
    useEffect(() => {
        if (!isConnected && address) {
            // Wallet disconnected - only clear wallet-related data if we had an address
            // Don't clear SSO state here as it's managed separately
            queryClient.removeQueries({ queryKey: providerQueryKeys.isLabProvider(address) });
            
            // Only clear user state if it was wallet-based (not SSO)
            if (!isSSO) {
                setUser(null);
            }
        } else if (isConnected && address) {
            // Invalidate provider status cache when wallet connects
            queryClient.invalidateQueries({ 
                queryKey: providerQueryKeys.isLabProvider(address) 
            });
        }
    }, [isConnected, address, queryClient, isSSO]);

    // Handle errors
    useEffect(() => {
        if (ssoError) {
            handleError(ssoError, { context: 'SSO session fetch' });
        }
        if (providerError) {
            handleError(providerError, { context: 'Provider status fetch' });
        }
    }, [ssoError, providerError]);

    // Refresh provider status function
    const refreshProviderStatus = useCallback(async () => {
        if (!address) return;
        
        try {
            await refreshProviderStatusMutation.mutateAsync({ 
                identifier: address, 
                isEmail: false 
            });
        } catch (error) {
            handleError(error, { context: 'Refresh provider status' });
        }
    }, [address, refreshProviderStatusMutation, handleError]);

    // SSO logout function
    const logoutSSO = useCallback(async () => {
        devLog.log('🚪 SSO LOGOUT STARTED');
        
        // Set logout flag IMMEDIATELY to prevent any queries from running
        setIsLoggingOut(true);
        devLog.log('🔒 Logout flag set - ALL SSO queries now disabled');
        
        // Small delay to ensure state propagates and disables queries
        await new Promise(resolve => setTimeout(resolve, 200));
        
        try {
            
            // Clear local state immediately
            setIsSSO(false);
            setUser(null);
            devLog.log('✅ Local state cleared (isSSO=false, user=null)');
            
            // Cancel any ongoing queries FIRST to prevent race conditions
            devLog.log('🚫 Canceling queries...');
            queryClient.cancelQueries({ queryKey: userQueryKeys.ssoSession() });
            queryClient.cancelQueries({ queryKey: userQueryKeys.all() });
            
            // Force set empty data to prevent any cached data from being used
            devLog.log('💾 Setting empty query data...');
            queryClient.setQueryData(userQueryKeys.ssoSession(), { user: null, isSSO: false });
            
            // Remove queries completely
            devLog.log('🗑️ Removing queries from cache...');
            queryClient.removeQueries({ queryKey: userQueryKeys.ssoSession() });
            queryClient.removeQueries({ queryKey: userQueryKeys.all() });
            
            // Call logout endpoint and wait for completion
            devLog.log('🌐 Calling logout endpoint...');
            const response = await fetch("/api/auth/logout", {
                method: 'GET',
                credentials: 'include'
            });
            
            if (!response.ok) {
                devLog.log('❌ Logout endpoint failed:', response.status);
            } else {
                const data = await response.json();
                devLog.log('✅ Server session cleared:', data);
            }
            
            // Wait longer to ensure server-side cleanup is complete
            devLog.log('⏰ Waiting for server cleanup to complete...');
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            // Verify session is actually cleared by making a test call
            devLog.log('🔍 Verifying session is cleared...');
            try {
                const verifyResponse = await fetch('/api/auth/sso/session', {
                    method: 'GET',
                    credentials: 'include'
                });
                const sessionData = await verifyResponse.json();
                if (sessionData.user || sessionData.isSSO) {
                    devLog.log('⚠️ Session still active after logout, forcing additional cleanup');
                } else {
                    devLog.log('✅ Session verification: successfully cleared');
                }
            } catch (verifyError) {
                devLog.log('ℹ️ Session verification failed (likely good - no session):', verifyError.message);
            }
            
            // Triple-clear cache to ensure any background refetches are overridden
            devLog.log('🔒 Final aggressive cache cleanup...');
            queryClient.setQueryData(userQueryKeys.ssoSession(), { user: null, isSSO: false });
            queryClient.removeQueries({ queryKey: userQueryKeys.ssoSession() });
            queryClient.removeQueries({ queryKey: userQueryKeys.all() });
            
            // Keep logout flag active for longer to ensure no race conditions
            setTimeout(() => {
                devLog.log('🔄 Re-enabling queries after logout cleanup');
                setIsLoggingOut(false);
            }, 3000); // 3 seconds total to ensure complete cleanup

            devLog.log('✅ SSO LOGOUT COMPLETED');
            return true;
        } catch (error) {
            devLog.log('❌ SSO LOGOUT ERROR:', error);
            handleError(error, { context: 'SSO logout' });
            // Even if there's an error, still clear local state
            setIsSSO(false);
            setUser(null);
            queryClient.setQueryData(userQueryKeys.ssoSession(), { user: null, isSSO: false });
            queryClient.removeQueries({ queryKey: userQueryKeys.ssoSession() });
            queryClient.removeQueries({ queryKey: userQueryKeys.all() });
            setTimeout(() => setIsLoggingOut(false), 3000);
            return true;
        }
    }, [queryClient, handleError]);

    const value = {
        // User state
        user,
        isSSO,
        isProvider,
        isProviderLoading, // Only provider loading, not combined with SSO
        isLoggedIn,
        isConnected,
        address,
        hasIncompleteData,
        isLoading,
        isWalletLoading,
        
        // Actions
        refreshProviderStatus,
        logoutSSO,
        
        // Error handling
        handleError,
    };

    return (
        <OptimizedUserProvider value={value}>
            {children}
        </OptimizedUserProvider>
    );
}

/**
 * User data provider with error boundary
 * Main export for user context with error handling wrapper
 * @param {Object} props
 * @param {React.ReactNode} props.children - Child components to wrap with user context
 * @returns {JSX.Element} User context provider wrapped with error boundary
 */
export function UserData({ children }) {
    return (
        <ErrorBoundary 
            fallback={() => <div>Error loading user data</div>}
            category={ErrorCategory.COMPONENT}
        >
            <UserDataCore>
                {children}
            </UserDataCore>
        </ErrorBoundary>
    );
}

/**
 * Hook to access user context data
 * Provides user state, authentication status, and user management functions
 * @returns {Object} User context data including address, SSO status, and helper functions
 * @returns {string|null} returns.address - User's wallet address
 * @returns {boolean} returns.isConnected - Whether wallet is connected
 * @returns {boolean} returns.isSSO - Whether user is authenticated via SSO
 * @returns {Object|null} returns.user - User data object
 * @returns {boolean} returns.isLoading - General loading state for user data
 * @returns {boolean} returns.isWalletLoading - Specific loading state for wallet connection/reconnection
 * @returns {Function} returns.refreshProviderStatus - Function to refresh provider status
 * @throws {Error} When used outside of UserData provider
 */
export function useUser() {
    const context = useUserContext();
    if (!context) {
        throw new Error('useUser must be used within a UserData provider');
    }
    return context;
}

// PropTypes
UserDataCore.propTypes = {
    children: PropTypes.node.isRequired
}

UserData.propTypes = {
    children: PropTypes.node.isRequired
}
