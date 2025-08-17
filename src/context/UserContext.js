"use client";
import { useState, useEffect, useCallback } from 'react'
import PropTypes from 'prop-types'
import { useAccount } from 'wagmi'
import { useQueryClient } from '@tanstack/react-query'
import { 
  useSSOSessionQuery, 
  useIsLabProvider, 
  useLabProviders, 
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

// Create optimized context with automatic memoization
const { Provider: OptimizedUserProvider, useContext: useUserContext } = createOptimizedContext('UserContext');

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

    // Track initial connection state to prevent flash of authenticated content
    const isWalletLoading = isReconnecting || isConnecting;

    // React Query hooks for data fetching
    const { 
        data: ssoData, 
        isLoading: ssoLoading,
        error: ssoError 
    } = useSSOSessionQuery({
        enabled: isConnected && !isWalletLoading // Only fetch when wallet connection is stable
    });

    const { 
        data: providerStatus, 
        isLoading: isProviderLoading,
        error: providerError 
    } = useIsLabProvider(address, {
        enabled: Boolean(address) && !isWalletLoading, // Only fetch when wallet connection is stable
        retry: false, // Don't retry failed provider status queries
    });

    // Get provider details only if user is a provider
    const { 
        data: providersData,
        isLoading: isProvidersLoading 
    } = useLabProviders({
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
    const isLoggedIn = isConnected && Boolean(address) && !isWalletLoading;
    const hasIncompleteData = isLoggedIn && (isProviderLoading || ssoLoading);
    
    // Combined loading state - don't wait for providers list for basic functionality
    const isLoading = isWalletLoading || (isConnected && (isProviderLoading || ssoLoading));

    // Combined effect to handle both SSO and provider data with proper name priority
    useEffect(() => {
        let updatedUser = {};
        let shouldUpdate = false;

        // Handle SSO session data
        if (ssoData) {
            setIsSSO(Boolean(ssoData.isSSO));
            
            if (ssoData.user) {
                updatedUser = {
                    ...updatedUser,
                    ...ssoData.user,
                    address: address || updatedUser.address
                };
                shouldUpdate = true;
            }
        }

        // Handle provider data
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

        // Update user state only if there are changes
        if (shouldUpdate) {
            setUser(prev => ({
                ...prev,
                ...updatedUser
            }));
        }
    }, [ssoData, address, providerStatus, providersData]);

    // Handle connection changes
    useEffect(() => {
        if (!isConnected) {
            setIsSSO(false);
            setUser(null);
            // Clear provider-related cache when disconnecting
            queryClient.removeQueries({ queryKey: providerQueryKeys.all() });
        } else if (isConnected && address) {
            // Invalidate provider status cache when wallet connects
            // Invalidate provider status cache using the correct query key for useIsLabProvider
            queryClient.invalidateQueries({ 
                queryKey: providerQueryKeys.isLabProvider(address) 
            });
        }
    }, [isConnected, address, queryClient]);

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
        
        // Refresh function
        refreshProviderStatus,
        
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
