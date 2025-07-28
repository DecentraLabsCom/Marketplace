"use client";
import { useState, useEffect, useCallback } from 'react'
import PropTypes from 'prop-types'
import { useAccount } from 'wagmi'
import { 
  useSSOSessionQuery, 
  useProviderStatusQuery, 
  useProviderNameQuery,
  useRefreshProviderStatusMutation 
} from '@/hooks/user/useUsers'
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
 * Core user data provider component with React Query integration
 * Manages user state, SSO authentication, and provider status
 * @param {Object} props
 * @param {React.ReactNode} props.children - Child components to wrap with user context
 * @returns {JSX.Element} Provider with user data and authentication state
 */
function UserDataCore({ children }) {
    const { address, isConnected } = useAccount();
    const { handleError: originalHandleError } = useErrorHandler();
    const [isSSO, setIsSSO] = useState(false);
    const [user, setUser] = useState(null);

    // React Query hooks for data fetching
    const { 
        data: ssoData, 
        isLoading: ssoLoading,
        error: ssoError 
    } = useSSOSessionQuery({
        enabled: isConnected
    });

    const { 
        data: providerStatus, 
        isLoading: isProviderLoading,
        error: providerError 
    } = useProviderStatusQuery(address, false, {
        enabled: Boolean(address)
    });

    const { 
        data: providerName,
        isLoading: providerNameLoading 
    } = useProviderNameQuery(address, {
        enabled: Boolean(address) && Boolean(providerStatus?.isLabProvider)
    });

    const refreshProviderStatusMutation = useRefreshProviderStatusMutation();

    // Safe error handler wrapper
    const handleError = useCallback((error, context = {}) => {
        if (!error) {
            const validError = new Error('Null or undefined error in UserContext');
            validError.severity = ErrorSeverity.LOW;
            validError.category = ErrorCategory.VALIDATION;
            originalHandleError(validError, context);
            return;
        }

        if (typeof error === 'object' && Object.keys(error).length === 0) {
            const validError = new Error('Empty error object in UserContext');
            validError.severity = ErrorSeverity.LOW;
            validError.category = ErrorCategory.VALIDATION;
            originalHandleError(validError, context);
            return;
        }

        originalHandleError(error, context);
    }, [originalHandleError]);

    // Computed values
    const isProvider = Boolean(providerStatus?.isLabProvider);
    const isLoggedIn = isConnected && Boolean(address);
    const hasIncompleteData = isLoggedIn && (isProviderLoading || ssoLoading);

    // Handle SSO session data
    useEffect(() => {
        if (ssoData) {
            setIsSSO(Boolean(ssoData.isSSO));
            
            if (ssoData.user) {
                setUser(prev => ({
                    ...prev,
                    ...ssoData.user,
                    address: address || prev?.address
                }));
            }
        }
    }, [ssoData, address]);

    // Handle provider data
    useEffect(() => {
        if (address && providerStatus) {
            setUser(prev => ({
                ...prev,
                address,
                name: providerName || prev?.name || null,
                isProvider: providerStatus.isLabProvider
            }));
        }
    }, [address, providerStatus, providerName]);

    // Handle connection changes
    useEffect(() => {
        if (!isConnected) {
            setIsSSO(false);
            setUser(null);
        }
    }, [isConnected]);

    // Handle errors
    useEffect(() => {
        if (ssoError) {
            handleError(ssoError, { context: 'SSO session fetch' });
        }
        if (providerError) {
            handleError(providerError, { context: 'Provider status fetch' });
        }
    }, [ssoError, providerError, handleError]);

    // Refresh provider status function
    const refreshProviderStatus = useCallback(async () => {
        if (!address) return;
        
        try {
            await refreshProviderStatusMutation.mutateAsync({ 
                identifier: address, 
                isEmail: false 
            });
            devLog.log(`✅ UserContext: Provider status refreshed for ${address}`);
        } catch (error) {
            handleError(error, { context: 'Refresh provider status' });
        }
    }, [address, refreshProviderStatusMutation, handleError]);

    // Legacy fetchSSOSession function (now uses React Query internally)
    const fetchSSOSession = useCallback(async () => {
        devLog.log('🔄 UserContext: fetchSSOSession - Using React Query');
        // The actual fetching is handled by useSSOSessionQuery
        return ssoData;
    }, [ssoData]);

    // Legacy fetchProviderStatus function (now uses React Query internally)
    const fetchProviderStatus = useCallback(async (identifier, isEmail = false) => {
        devLog.log(`🔄 UserContext: fetchProviderStatus(${identifier}) - Using React Query`);
        // The actual fetching is handled by useProviderStatusQuery
        return providerStatus;
    }, [providerStatus]);

    // Legacy fetchProviderName function (now uses React Query internally)
    const fetchProviderName = useCallback(async (wallet) => {
        devLog.log(`🔄 UserContext: fetchProviderName(${wallet}) - Using React Query`);
        // The actual fetching is handled by useProviderNameQuery
        return providerName;
    }, [providerName]);

    const value = {
        // User state
        user,
        isSSO,
        isProvider,
        isProviderLoading: isProviderLoading || providerNameLoading || ssoLoading,
        isLoggedIn,
        isConnected,
        address,
        hasIncompleteData,
        
        // Legacy functions (now powered by React Query)
        fetchSSOSession,
        fetchProviderStatus,
        fetchProviderName,
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
            fallback={<div>Error loading user data</div>}
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
