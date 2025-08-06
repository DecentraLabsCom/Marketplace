"use client";
import { createContext, useContext, useRef, useCallback, useState } from 'react'
import { useWatchContractEvent, useAccount } from 'wagmi'
import { useUser } from './UserContext'
import { useNotifications } from './NotificationContext'
import { useUserCacheUpdates } from '@/hooks/user/useUsers'
import { contractABI, contractAddresses } from '@/contracts/diamond'
import { selectChain } from '@/utils/blockchain/selectChain'
import devLog from '@/utils/dev/logger'
import PropTypes from 'prop-types'

const UserEventContext = createContext();

/**
 * Provider for user-related blockchain events
 * @param {Object} props - Component props
 * @param {React.ReactNode} props.children - Child components
 */
export function UserEventProvider({ children }) {
    const { chain, address: userAddress } = useAccount();
    const { user, isSSO } = useUser();
    const { addPersistentNotification } = useNotifications();
    const userCacheUpdates = useUserCacheUpdates();
    const safeChain = selectChain(chain);
    const contractAddress = contractAddresses[safeChain.name.toLowerCase()];

    // Debouncing and state management for intelligent updates
    const lastEventTime = useRef(new Map()); // Track last event time by type
    const pendingUpdates = useRef(new Set()); // Track pending provider IDs for updates
    const updateTimeoutRef = useRef(null);

    // Manual update tracking for coordination (useState for reactivity)
    const [manualUpdateInProgress, setManualUpdateInProgressState] = useState(false);
    const manualUpdateTimeout = useRef(null);

    // Function to check if manual update is in progress
    const isManualUpdateInProgress = manualUpdateInProgress;

    // Function to set manual update in progress
    const setManualUpdateInProgress = useCallback((inProgress, duration = 3000) => {
        setManualUpdateInProgressState(inProgress);
        
        if (inProgress) {
            // Clear existing timeout
            if (manualUpdateTimeout.current) {
                clearTimeout(manualUpdateTimeout.current);
            }
            
            // Auto-clear after duration
            manualUpdateTimeout.current = setTimeout(() => {
                setManualUpdateInProgressState(false);
                devLog.log('🕒 Manual update timeout cleared (UserEvent)');
            }, duration);
        } else {
            // Clear timeout immediately
            if (manualUpdateTimeout.current) {
                clearTimeout(manualUpdateTimeout.current);
                manualUpdateTimeout.current = null;
            }
        }
    }, []);

    /**
     * Smart user cache update - tries granular first, falls back to invalidation
     * @param {string} userAddress - User address
     * @param {Object} [userData] - User data for granular updates
     * @param {string} [action] - Action type: 'add', 'remove', 'update'
     * @param {string} [context] - Context: 'user', 'provider', or 'both'
     * @param {string} [reason] - Reason for cache update
     */
    const updateUserCaches = async (userAddress = null, userData = null, action = null, context = 'both', reason = 'event') => {
        devLog.log(`🎯 [UserEventContext] Smart cache update (reason: ${reason}):`, { userAddress, action, context });
        
        // Try granular update first if we have user data and action
        if (userData && action && userAddress) {
            try {
                userCacheUpdates.smartUserInvalidation(userAddress, userData, action, context);
                devLog.log(`✅ [UserEventContext] Granular cache update completed`);
                return;
            } catch (error) {
                devLog.warn('⚠️ Granular user update failed, falling back to invalidation:', error);
            }
        }
        
        // Fallback to traditional invalidation using smart invalidation
        if (userAddress) {
            userCacheUpdates.smartUserInvalidation(userAddress, null, 'update', context);
        }

        devLog.log(`✅ [UserEventContext] Cache update completed`);
    };

    // Legacy cache invalidation for compatibility
    const invalidateUserCache = useCallback((userId = null) => {
        if (userId) {
            // Use new granular system with fallback behavior
            updateUserCaches(userId, null, 'update', 'both', 'legacy_invalidation');
        } else {
            // Full invalidation - clear user/provider cache
            sessionStorage.removeItem('user_provider_status');
            sessionStorage.removeItem('user_data_timestamp');
        }
    }, []);

    // Debounced batch update for multiple user changes
    const scheduleUserUpdate = useCallback((delay = 500) => {
        if (updateTimeoutRef.current) {
            clearTimeout(updateTimeoutRef.current);
        }
        
        updateTimeoutRef.current = setTimeout(async () => {
            if (pendingUpdates.current.size > 0) {
                devLog.log('Processing batch user updates for IDs:', Array.from(pendingUpdates.current));
                
                // Use new granular cache update system
                for (const providerId of pendingUpdates.current) {
                    await updateUserCaches(providerId, null, 'update', 'provider', 'batch_update');
                }
                
                pendingUpdates.current.clear();
            }
        }, delay);
    }, [userCacheUpdates]);

    // Enhanced event handlers with collision prevention
    async function handleProviderAdded(args) {
        const eventKey = `ProviderAdded_${args._account}`;
        const now = Date.now();
        
        // Prevent duplicate processing of same event within 2 seconds
        if (lastEventTime.current.has(eventKey) && 
            now - lastEventTime.current.get(eventKey) < 2000) {
            return;
        }
        lastEventTime.current.set(eventKey, now);

        // ✅ CHECK: Skip if manual update is in progress
        if (isManualUpdateInProgress) {
            devLog.log('⏸️ Skipping ProviderAdded event - manual update in progress:', args._account);
            return;
        }

        devLog.log('🏢 ProviderAdded event received (processing):', args);

        const { _account, _name, _email, _country } = args;
        
        // Check if this event affects the current user
        const affectsCurrentUser = isSSO ? 
            (user?.email && _email === user.email) : 
            (userAddress && _account.toLowerCase() === userAddress.toLowerCase());
        
        if (affectsCurrentUser) {
            // Current user became a provider
            addPersistentNotification('success', `🎉 Welcome as a new provider, ${_name}!`);
            // Use granular cache update for provider addition
            await updateUserCaches(
                _account,
                {
                    address: _account,
                    name: _name,
                    email: _email,
                    country: _country,
                    isProvider: true,
                    timestamp: new Date().toISOString()
                },
                'add',
                'provider',
                'provider_added_self'
            );
        } else {
            // Another user became a provider
            addPersistentNotification('info', `🏢 New provider joined: ${_name} from ${_country}`);
            // Use granular cache update for new provider in list
            await updateUserCaches(
                _account,
                {
                    address: _account,
                    name: _name,
                    email: _email,
                    country: _country,
                    isProvider: true,
                    timestamp: new Date().toISOString()
                },
                'add',
                'provider',
                'provider_added_other'
            );
        }
    }

    async function handleProviderRemoved(args) {
        const eventKey = `ProviderRemoved_${args._account}`;
        const now = Date.now();
        
        // Prevent duplicate processing
        if (lastEventTime.current.has(eventKey) && 
            now - lastEventTime.current.get(eventKey) < 2000) {
            return;
        }
        lastEventTime.current.set(eventKey, now);

        // ✅ CHECK: Skip if manual update is in progress
        if (isManualUpdateInProgress) {
            devLog.log('⏸️ Skipping ProviderRemoved event - manual update in progress:', args._account);
            return;
        }

        devLog.log('🗑️ ProviderRemoved event received (processing):', args);

        const { _account } = args;
        
        // Check if this event affects the current user
        const affectsCurrentUser = isSSO ? 
            (user?.account && _account.toLowerCase() === user.account.toLowerCase()) : 
            (userAddress && _account.toLowerCase() === userAddress.toLowerCase());
        
        if (affectsCurrentUser) {
            // Current user is no longer a provider
            addPersistentNotification('warning', '📢 Your provider status has been removed');
            // Use granular cache update for provider removal
            await updateUserCaches(
                _account,
                { isProvider: false, timestamp: new Date().toISOString() },
                'update',
                'both',
                'provider_removed_self'
            );
        } else {
            // Another provider was removed
            addPersistentNotification('info', '🏢 A provider has left the platform');
            // Remove from providers list
            await updateUserCaches(
                _account,
                null,
                'remove',
                'provider',
                'provider_removed_other'
            );
        }
    }

    async function handleProviderUpdated(args) {
        const eventKey = `ProviderUpdated_${args._account}`;
        const now = Date.now();
        
        // Prevent duplicate processing and batch multiple updates
        if (lastEventTime.current.has(eventKey) && 
            now - lastEventTime.current.get(eventKey) < 2000) {
            return;
        }
        lastEventTime.current.set(eventKey, now);

        // ✅ CHECK: Skip if manual update is in progress
        if (isManualUpdateInProgress) {
            devLog.log('⏸️ Skipping ProviderUpdated event - manual update in progress:', args._account);
            return;
        }

        devLog.log('📝 ProviderUpdated event received (scheduling update):', args);
        
        const { _account, _name, _email, _country } = args;
        
        // Check if this event affects the current user
        const affectsCurrentUser = isSSO ? 
            (user?.email && _email === user.email) : 
            (userAddress && _account.toLowerCase() === userAddress.toLowerCase());
        
        if (affectsCurrentUser) {
            // Current user's provider info was updated
            addPersistentNotification('info', `✅ Your provider information has been updated`);
            // Use granular cache update for provider update
            await updateUserCaches(
                _account,
                {
                    address: _account,
                    name: _name,
                    email: _email,
                    country: _country,
                    timestamp: new Date().toISOString()
                },
                'update',
                'both',
                'provider_updated_self'
            );
        } else {
            // Another provider was updated
            devLog.log('📝 Provider updated:', _name, 'from', _country);
            // Update provider in list
            await updateUserCaches(
                _account,
                {
                    address: _account,
                    name: _name,
                    email: _email,
                    country: _country,
                    timestamp: new Date().toISOString()
                },
                'update',
                'provider',
                'provider_updated_other'
            );
        }
    }

    // Listen for ProviderAdded events
    useWatchContractEvent({
        address: contractAddress,
        abi: contractABI,
        eventName: 'ProviderAdded',
        onLogs(logs) {
            logs.forEach(log => {
                handleProviderAdded(log.args);
            });
        },
    });

    // Listen for ProviderRemoved events
    useWatchContractEvent({
        address: contractAddress,
        abi: contractABI,
        eventName: 'ProviderRemoved',
        onLogs(logs) {
            logs.forEach(log => {
                handleProviderRemoved(log.args);
            });
        },
    });

    // Listen for ProviderUpdated events
    useWatchContractEvent({
        address: contractAddress,
        abi: contractABI,
        eventName: 'ProviderUpdated',
        onLogs(logs) {
            logs.forEach(log => {
                handleProviderUpdated(log.args);
            });
        },
    });

    return (
        <UserEventContext.Provider value={{
            // Legacy functions for compatibility
            invalidateUserCache,
            scheduleUserUpdate,
            // Manual update coordination
            isManualUpdateInProgress,
            setManualUpdateInProgress,
            // Granular cache update functions
            updateUserCaches,
            // Granular cache utilities (exposed for manual UI usage)
            ...userCacheUpdates,
            // State
            pendingUpdates: pendingUpdates.current
        }}>
            {children}
        </UserEventContext.Provider>
    );
}

export function useUserEvents() {
    const context = useContext(UserEventContext);
    if (!context) {
        throw new Error('useUserEvents must be used within a UserEventProvider');
    }
    return context;
}

// PropTypes
UserEventProvider.propTypes = {
    children: PropTypes.node.isRequired,
};