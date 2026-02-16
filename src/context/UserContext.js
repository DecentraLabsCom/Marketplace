"use client";
import { useState, useEffect, useCallback, useContext, useRef } from 'react'
import PropTypes from 'prop-types'
import { useConnection } from 'wagmi'
import { useQueryClient } from '@tanstack/react-query'
import { 
  useSSOSessionQuery, 
  useIsLabProvider, 
  useGetLabProviders,
  useUserCacheUpdates,
  useInstitutionResolve
} from '@/hooks/user/useUsers'
import { providerQueryKeys } from '@/utils/hooks/queryKeys'
import { 
  ErrorBoundary, 
  useErrorHandler, 
  ErrorSeverity,
  ErrorCategory 
} from '@/utils/errorBoundaries'
import { createOptimizedContext } from '@/utils/optimizedContext'
import {
    getConnectionAddress,
    isConnectionConnected,
    isConnectionConnecting,
    isConnectionReconnecting,
} from '@/utils/blockchain/connection'
import devLog from '@/utils/dev/logger'
import { transformRegistrationOptions, attestationToJSON } from '@/utils/webauthn/client'

// Create optimized context with automatic memoization
const { Context: UserContextInternal, Provider: OptimizedUserProvider, useContext: useUserContext } =
  createOptimizedContext('UserContext');

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

    if (userData.institutionName) {
        return userData.institutionName;
    }
    
    return null;
}

function isWalletSessionUser(sessionUser) {
    return Boolean(
        sessionUser?.authType === 'wallet' ||
        (typeof sessionUser?.id === 'string' && sessionUser.id.startsWith('wallet:'))
    );
}

/**
 * Core user data provider component with React Query integration
 * Manages user state, SSO authentication, and provider status
 * @param {Object} props
 * @param {React.ReactNode} props.children - Child components to wrap with user context
 * @returns {JSX.Element} Provider with user data and authentication state
 */
function UserDataCore({ children }) {
    const connection = useConnection();
    const address = getConnectionAddress(connection);
    const isConnected = isConnectionConnected(connection);
    const isReconnecting = isConnectionReconnecting(connection);
    const isConnecting = isConnectionConnecting(connection);
    const queryClient = useQueryClient();
    const { handleError: originalHandleError } = useErrorHandler();
    // undefined = unknown/initializing; prevents early Wallet-mode selection in hooks
    const [isSSO, setIsSSO] = useState(undefined);
    const [user, setUser] = useState(null);
    const [isLoggingOut, setIsLoggingOut] = useState(false);
    const [walletSessionCreated, setWalletSessionCreated] = useState(false);
    const [webAuthnBootstrapDone, setWebAuthnBootstrapDone] = useState(false);
    const lastWalletAddressRef = useRef(null);
    
    // Institutional onboarding state (WebAuthn credential at IB)
    const [institutionalOnboardingStatus, setInstitutionalOnboardingStatus] = useState(null); // null, 'pending', 'required', 'completed', 'advisory', 'no_backend'
    const [showOnboardingModal, setShowOnboardingModal] = useState(false);
    const [institutionRegistrationStatus, setInstitutionRegistrationStatus] = useState(null); // null, 'checking', 'registered', 'unregistered', 'error'
    const [institutionRegistrationWallet, setInstitutionRegistrationWallet] = useState(null);
    const [institutionBackendUrl, setInstitutionBackendUrl] = useState(null);

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

    // Auto-register WebAuthn credential on first SAML login (now opt-in via env flag)
    useEffect(() => {
        const bootstrapEnabled = process.env.NEXT_PUBLIC_WEBAUTHN_BOOTSTRAP_ENABLED === 'true';

        if (!bootstrapEnabled) {
            return;
        }
        if (!isSSO || !user || webAuthnBootstrapDone) {
            return;
        }
        if (typeof window === 'undefined' || !window.PublicKeyCredential) {
            devLog.log('WebAuthn not supported in this environment, skipping registration');
            return;
        }

        let cancelled = false;

        const bootstrapWebAuthn = async () => {
            try {
                const statusRes = await fetch('/api/auth/webauthn/status', {
                    method: 'GET',
                    credentials: 'include',
                });
                const statusData = await statusRes.json().catch(() => ({}));
                if (statusData?.registered) {
                    setWebAuthnBootstrapDone(true);
                    return;
                }

                const optionsRes = await fetch('/api/auth/webauthn/options', {
                    method: 'GET',
                    credentials: 'include',
                });
                const optionsData = await optionsRes.json().catch(() => ({}));
                if (!optionsRes.ok || optionsData.registered) {
                    setWebAuthnBootstrapDone(true);
                    return;
                }

                const publicKey = transformRegistrationOptions(optionsData.options);
                if (!publicKey) {
                    setWebAuthnBootstrapDone(true);
                    return;
                }

                const credential = await navigator.credentials.create({ publicKey });
                if (!credential || cancelled) return;
                const attestation = attestationToJSON(credential);
                await fetch('/api/auth/webauthn/register', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({ attestation }),
                });
                setWebAuthnBootstrapDone(true);
            } catch (error) {
                devLog.warn('WebAuthn bootstrap failed', error);
                setWebAuthnBootstrapDone(true);
            }
        };

        bootstrapWebAuthn();
        return () => {
            cancelled = true;
        };
    }, [isSSO, user, webAuthnBootstrapDone]);

    useEffect(() => {
        if (!isSSO || !user) {
            setWebAuthnBootstrapDone(false);
        }
    }, [isSSO, user]);

    const institutionDomain = user?.affiliation || user?.schacHomeOrganization || null;

    // Check institutional onboarding status after SSO login
    // This verifies if the user has registered a WebAuthn credential at their IB
    useEffect(() => {
        if (!isSSO || !user || institutionalOnboardingStatus !== null) {
            return;
        }

        if (!institutionRegistrationStatus || institutionRegistrationStatus === 'checking') {
            return;
        }

        if (institutionRegistrationStatus !== 'registered') {
            devLog.log('[InstitutionalOnboarding] Institution not registered, skipping onboarding check');
            return;
        }

        // Need backend URL to check onboarding status
        if (!institutionBackendUrl) {
            devLog.log('[InstitutionalOnboarding] No backend URL available');
            setInstitutionalOnboardingStatus('no_backend');
            setShowOnboardingModal(false);
            return;
        }

        let cancelled = false;

        const checkInstitutionalOnboarding = async () => {
            try {
                devLog.log('[InstitutionalOnboarding] Checking status for SSO user...');
                
                // Step 1: Get session data from our API (no external calls)
                const sessionResponse = await fetch('/api/onboarding/session', {
                    method: 'GET',
                    credentials: 'include',
                });

                if (cancelled) return;

                if (!sessionResponse.ok) {
                    devLog.warn('[InstitutionalOnboarding] Session fetch failed:', sessionResponse.status);
                    setInstitutionalOnboardingStatus('error');
                    return;
                }

                const sessionData = await sessionResponse.json();
                const stableUserId = sessionData.meta?.stableUserId;

                if (!stableUserId) {
                    devLog.warn('[InstitutionalOnboarding] No stableUserId in session');
                    setInstitutionalOnboardingStatus('error');
                    return;
                }

                // Step 2: Check if user has credentials directly with IB
                const statusUrl = `${institutionBackendUrl}/onboarding/webauthn/key-status/${encodeURIComponent(stableUserId)}`;
                
                const statusResponse = await fetch(statusUrl, {
                    method: 'GET',
                    headers: { 'Content-Type': 'application/json' },
                });

                if (cancelled) return;

                // 404 means not onboarded yet
                if (statusResponse.status === 404) {
                    devLog.log('[InstitutionalOnboarding] User needs onboarding');
                    setInstitutionalOnboardingStatus('required');
                    setShowOnboardingModal(true);
                    return;
                }

                if (!statusResponse.ok) {
                    // Backend unreachable or errored; do not block the user with a modal
                    devLog.warn('[InstitutionalOnboarding] Status check failed, skipping modal:', statusResponse.status);
                    setInstitutionalOnboardingStatus('error');
                    setShowOnboardingModal(false);
                    return;
                }

                const statusData = await statusResponse.json();

                // key-status endpoint returns { hasCredential: boolean, hasPlatformCredential?: boolean }
                if (statusData.hasCredential) {
                    // If IB explicitly indicates platform credential absence, show advisory
                    if (statusData.hasPlatformCredential === false) {
                        devLog.log('[InstitutionalOnboarding] Credential exists but no platform key detected; showing advisory');
                        setInstitutionalOnboardingStatus('advisory');
                        setShowOnboardingModal(true);
                        return;
                    }

                    // Otherwise, check local browser for a registered credential so we can
                    // surface the "Passkey on Another Device" advisory if needed.
                    try {
                        const localRes = await fetch('/api/auth/webauthn/status', {
                            method: 'GET',
                            credentials: 'include',
                        });
                        const localData = await localRes.json().catch(() => ({}));

                        if (!localData?.registered) {
                            devLog.log('[InstitutionalOnboarding] IB has credential but not registered in this browser; showing advisory');
                            setInstitutionalOnboardingStatus('advisory');
                            setShowOnboardingModal(true);
                            return;
                        }
                    } catch (err) {
                        devLog.warn('[InstitutionalOnboarding] Local webauthn status check failed, assuming onboarded', err);
                    }

                    devLog.log('[InstitutionalOnboarding] User already onboarded (local credential present)');
                    setInstitutionalOnboardingStatus('completed');
                    setShowOnboardingModal(false);
                    return;
                }

                // User needs onboarding - show modal
                devLog.log('[InstitutionalOnboarding] User needs onboarding');
                setInstitutionalOnboardingStatus('required');
                setShowOnboardingModal(true);

            } catch (error) {
                devLog.warn('[InstitutionalOnboarding] Check failed:', error);
                // Don't block the user, just mark as checked
                setInstitutionalOnboardingStatus('error');
            }
        };

        checkInstitutionalOnboarding();

        return () => {
            cancelled = true;
        };
    }, [isSSO, user, institutionalOnboardingStatus, institutionRegistrationStatus, institutionBackendUrl]);

    // Check whether the institution is already registered on-chain (for SSO users)
    // Using React Query for automatic caching, retry, and deduplication
    const {
        data: institutionData,
        isLoading: isInstitutionResolveLoading,
        error: institutionResolveError,
    } = useInstitutionResolve(institutionDomain, {
        enabled: isSSO && Boolean(user) && Boolean(institutionDomain),
    });

    // Sync React Query state to local state for backward compatibility
    useEffect(() => {
        if (!isSSO || !user) {
            setInstitutionRegistrationStatus(null);
            setInstitutionRegistrationWallet(null);
            setInstitutionBackendUrl(null);
            return;
        }

        if (!institutionDomain) {
            setInstitutionRegistrationStatus('error');
            setInstitutionRegistrationWallet(null);
            setInstitutionBackendUrl(null);
            return;
        }

        if (isInstitutionResolveLoading) {
            setInstitutionRegistrationStatus('checking');
            return;
        }

        if (institutionResolveError) {
            devLog.warn('[InstitutionRegistration] Resolve failed:', institutionResolveError);
            setInstitutionRegistrationStatus('error');
            setInstitutionRegistrationWallet(null);
            setInstitutionBackendUrl(null);
            return;
        }

        if (institutionData) {
            if (institutionData.registered) {
                setInstitutionRegistrationStatus('registered');
                setInstitutionRegistrationWallet(institutionData.wallet || null);
                setInstitutionBackendUrl(institutionData.backendUrl || null);
            } else {
                setInstitutionRegistrationStatus('unregistered');
                setInstitutionRegistrationWallet(null);
                setInstitutionBackendUrl(null);
            }
        }
    }, [isSSO, user, institutionDomain, institutionData, isInstitutionResolveLoading, institutionResolveError]);

    // Reset institutional onboarding status on logout
    useEffect(() => {
        if (!isSSO || !user) {
            setInstitutionalOnboardingStatus(null);
            setShowOnboardingModal(false);
            setInstitutionRegistrationStatus(null);
            setInstitutionRegistrationWallet(null);
            setInstitutionBackendUrl(null);
        }
    }, [isSSO, user]);

    const sessionIsWallet = isWalletSessionUser(ssoData?.user);

    // Determine current isSSO state based on session data
    // This needs to be calculated BEFORE using the router hooks
    const currentIsSSO = Boolean(ssoData?.user) && !sessionIsWallet;

    const { 
        data: providerStatus, 
        isLoading: isProviderLoading,
        error: providerError 
    } = useIsLabProvider(address, {
        isSSO: currentIsSSO, // Pass explicitly to avoid context dependency
        enabled: Boolean(address) && !isWalletLoading, // Only fetch when wallet connection is stable
        retry: false, // Don't retry failed provider status queries
    });

    // Get provider details only if user is a provider
    const { 
        data: providersData,
        isLoading: isProvidersLoading 
    } = useGetLabProviders({
        isSSO: currentIsSSO, // Pass explicitly to avoid context dependency
        enabled: Boolean(providerStatus?.isLabProvider), // Only fetch if user is confirmed provider
        staleTime: 10 * 60 * 1000, // 10 minutes for provider list
    });

    // Cache update utilities
    const { refreshProviderStatus: refreshProviderStatusFromCache, clearSSOSession } = useUserCacheUpdates();

    // Create wallet session when wallet connects (only for non-SSO users)
    useEffect(() => {
        const createWalletSession = async () => {
            // Skip if: logging out, SSO user, no address, already created, or wallet loading
            if (isLoggingOut || isSSO || !address || walletSessionCreated || isWalletLoading) {
                return;
            }

            try {
                devLog.log('🔐 Creating wallet session for:', address);
                const response = await fetch('/api/auth/wallet-session', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({ walletAddress: address }),
                });

                if (response.ok) {
                    setWalletSessionCreated(true);
                    devLog.log('✅ Wallet session created successfully');
                    // Refetch SSO query to pick up the new session
                    refetchSSO();
                } else {
                    devLog.warn('⚠️ Failed to create wallet session:', response.status);
                }
            } catch (error) {
                devLog.error('❌ Error creating wallet session:', error);
            }
        };

        if (isConnected && address && !isSSO) {
            createWalletSession();
        }
    }, [isConnected, address, isSSO, walletSessionCreated, isWalletLoading, isLoggingOut, refetchSSO]);

    // Destroy wallet session when wallet disconnects
    const destroyWalletSession = useCallback(async (options = {}) => {
        const forceDestroy = Boolean(options.force);
        if (!walletSessionCreated && !forceDestroy) return;
        
        try {
            devLog.log('Destroying wallet session...');
            await fetch('/api/auth/wallet-logout', {
                method: 'POST',
                credentials: 'include',
            });
            devLog.log('Wallet session destroyed');
        } catch (error) {
            devLog.error('Error destroying wallet session:', error);
        } finally {
            setWalletSessionCreated(false);
        }
    }, [walletSessionCreated]);

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
      const hasWalletSession = Boolean(sessionIsWallet);
      // Consider user logged in if either:
      // - Wallet is connected and stable, or
      // - We have any user object (SSO session)
      const isLoggedIn =
        (isConnected && Boolean(address) && !isWalletLoading) ||
        (Boolean(user) && isSSO);
    const hasIncompleteData = isLoggedIn && (isProviderLoading || ssoLoading);
    
    // Combined loading state - wait for SSO session resolution to prevent early redirects
    const isAuthInitializing = isSSO === undefined;
    const isLoading =
        isWalletLoading ||
        ssoLoading ||
        isAuthInitializing ||
        (isConnected && isProviderLoading);

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
        
        if (!isConnected && sessionIsWallet) {
            if (isSSO) {
                setIsSSO(false);
            }
            setUser(null);
            return;
        }
        
        let updatedUser = {};
        let shouldUpdate = false;

        // Handle SSO session data - this should work even without wallet connection
        if (ssoData) {
            devLog.log('🔑 Processing SSO data:', ssoData);
            
            // Only update isSSO if it has changed to prevent infinite loops
            const newIsSSO = Boolean(ssoData.user) && !isWalletSessionUser(ssoData.user);
            if (isSSO !== newIsSSO) {
                setIsSSO(newIsSSO);
            }
            
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
                
                // Only update isSSO if it has changed
                if (isSSO !== false) {
                    setIsSSO(false);
                }
                
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
            setUser(prev => {
                // Deep comparison to avoid unnecessary updates
                const hasChanged = JSON.stringify(prev) !== JSON.stringify({ ...prev, ...updatedUser });
                if (hasChanged) {
                    return { ...prev, ...updatedUser };
                }
                return prev;
            });
        }
    }, [ssoData, address, providerStatus, providersData?.providers, isLoggingOut, isSSO, isConnected, sessionIsWallet]);

    // Handle connection changes - only clear wallet-related data, preserve SSO
    useEffect(() => {
        if (isConnected && address) {
            lastWalletAddressRef.current = address;
        }

        const addressToClear = address || lastWalletAddressRef.current;

        if (!isConnected) {
            // Wallet disconnected - only clear wallet-related data
            if (addressToClear) {
                queryClient.removeQueries({ queryKey: providerQueryKeys.isLabProvider(addressToClear) });
            }
            
            // Destroy wallet session when wallet disconnects (manual or external)
            if (!isSSO) {
                destroyWalletSession({ force: sessionIsWallet });
                setUser(null);
            }
            return;
        }

        if (address) {
            // Invalidate provider status cache when wallet connects
            queryClient.invalidateQueries({ 
                queryKey: providerQueryKeys.isLabProvider(address) 
            });
        }
    }, [isConnected, address, queryClient, isSSO, destroyWalletSession, sessionIsWallet]);

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
            await refreshProviderStatusFromCache(address);
        } catch (error) {
            handleError(error, { context: 'Refresh provider status' });
        }
    }, [address, refreshProviderStatusFromCache, handleError]);

    // SSO logout function
    const logoutSSO = useCallback(async () => {
        devLog.log('🚪 SSO LOGOUT STARTED');
        
        // Set logout flag IMMEDIATELY to prevent any queries from running
        setIsLoggingOut(true);
        // Reset institutional onboarding state on logout
        setInstitutionalOnboardingStatus(null);
        setShowOnboardingModal(false);
        devLog.log('🔒 Logout flag set - ALL SSO queries now disabled');
        
        // Small delay to ensure state propagates and disables queries
        await new Promise(resolve => setTimeout(resolve, 200));
        
        try {
            
            // Clear local state immediately
            setIsSSO(false);
            setUser(null);
            devLog.log('✅ Local state cleared (isSSO=false, user=null)');
            
            // Use cache update utility to clear SSO session
            clearSSOSession();
            
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
            clearSSOSession();
            
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
            clearSSOSession();
            setTimeout(() => setIsLoggingOut(false), 3000);
            return true;
        }
    }, [queryClient, handleError, clearSSOSession]);

    // Institutional onboarding handlers
    const handleOnboardingComplete = useCallback(() => {
        devLog.log('[InstitutionalOnboarding] Onboarding completed successfully');
        setInstitutionalOnboardingStatus('completed');
        setShowOnboardingModal(false);
    }, []);

    const handleOnboardingSkip = useCallback(() => {
        devLog.log('[InstitutionalOnboarding] User skipped onboarding');
        setInstitutionalOnboardingStatus('pending');
        setShowOnboardingModal(false);
    }, []);

    const openOnboardingModal = useCallback(() => {
        if (institutionalOnboardingStatus !== 'completed' && institutionalOnboardingStatus !== 'no_backend') {
            setShowOnboardingModal(true);
        }
    }, [institutionalOnboardingStatus]);

    const closeOnboardingModal = useCallback(() => {
        setShowOnboardingModal(false);
    }, []);

    const value = {
        // User state
        user,
        isSSO,
        isProvider,
        isProviderLoading, // Only provider loading, not combined with SSO
        isLoggedIn,
        isConnected,
        address,
        hasWalletSession,
        hasIncompleteData,
        isLoading,
        isWalletLoading,
        
        // Institutional onboarding state
        institutionalOnboardingStatus,
        showOnboardingModal,
        needsInstitutionalOnboarding: institutionalOnboardingStatus === 'required' || institutionalOnboardingStatus === 'pending',
        isInstitutionallyOnboarded: institutionalOnboardingStatus === 'completed' || institutionalOnboardingStatus === 'advisory',
        institutionRegistrationStatus,
        institutionRegistrationWallet,
        institutionBackendUrl,
        institutionDomain,
        isInstitutionRegistered: institutionRegistrationStatus === 'registered',
        isInstitutionRegistrationLoading: institutionRegistrationStatus === 'checking',
        
        // Actions
        refreshProviderStatus,
        logoutSSO,
        
        // Institutional onboarding actions
        openOnboardingModal,
        closeOnboardingModal,
        handleOnboardingComplete,
        handleOnboardingSkip,
        
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
 * @returns {boolean} returns.hasWalletSession - Whether wallet backend session is active
 * @returns {boolean} returns.isLoading - General loading state for user data
 * @returns {boolean} returns.isWalletLoading - Specific loading state for wallet connection/reconnection
 * @returns {string|null} returns.institutionalOnboardingStatus - Status: null, 'pending', 'required', 'completed', 'advisory', 'no_backend', 'error'
 * @returns {boolean} returns.showOnboardingModal - Whether to show the onboarding modal
 * @returns {boolean} returns.needsInstitutionalOnboarding - Whether user needs institutional onboarding
 * @returns {boolean} returns.isInstitutionallyOnboarded - Whether user has completed institutional onboarding
 * @returns {string|null} returns.institutionRegistrationStatus - Status: null, 'checking', 'registered', 'unregistered', 'error'
 * @returns {string|null} returns.institutionRegistrationWallet - Wallet address if institution is registered
 * @returns {boolean} returns.isInstitutionRegistered - Whether institution is registered
 * @returns {boolean} returns.isInstitutionRegistrationLoading - Whether institution registration check is in progress
 * @returns {Function} returns.refreshProviderStatus - Function to refresh provider status
 * @returns {Function} returns.openOnboardingModal - Function to open the onboarding modal
 * @returns {Function} returns.closeOnboardingModal - Function to close the onboarding modal
 * @returns {Function} returns.handleOnboardingComplete - Callback for when onboarding completes
 * @returns {Function} returns.handleOnboardingSkip - Callback for when user skips onboarding
 * @throws {Error} When used outside of UserData provider
 */
export function useUser() {
    const context = useUserContext();
    if (!context) {
        throw new Error('useUser must be used within a UserData provider');
    }
    return context;
}

/**
 * Optional user hook for utilities that can work without the provider being mounted.
 * Use this in helpers that can gracefully fall back (e.g., analytics, routing helpers) and
 * keep `useUser` for components that require the presence of the provider.
 * Returns null when the context isn't available instead of throwing.
 */
export function useOptionalUser() {
    return useContext(UserContextInternal) || null;
}

// PropTypes
UserDataCore.propTypes = {
    children: PropTypes.node.isRequired
}

UserData.propTypes = {
    children: PropTypes.node.isRequired
}
