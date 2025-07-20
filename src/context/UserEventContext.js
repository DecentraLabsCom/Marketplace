"use client"
import { createContext, useContext, useRef, useCallback, useState } from "react";
import { useWatchContractEvent } from 'wagmi';
import { contractABI, contractAddresses } from '@/contracts/diamond';
import { selectChain } from '@/utils/selectChain';
import { useAccount } from "wagmi";
import { useUser } from './UserContext';
import { useNotifications } from './NotificationContext';

const UserEventContext = createContext();

export function UserEventProvider({ children }) {
    const { chain, address: userAddress } = useAccount();
    const { user, isSSO, refreshProviderStatus } = useUser();
    const { addPersistentNotification } = useNotifications();
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

    // Smart cache invalidation for user/provider related updates
    const invalidateUserCache = useCallback((userId = null) => {
        if (userId) {
            // Selective invalidation - mark specific user for update
            pendingUpdates.current.add(userId);
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
        
        updateTimeoutRef.current = setTimeout(() => {
            if (pendingUpdates.current.size > 0) {
                devLog.log('Processing batch user updates for IDs:', Array.from(pendingUpdates.current));
                pendingUpdates.current.clear();
                if (typeof refreshProviderStatus === 'function') {
                    refreshProviderStatus();
                }
            }
        }, delay);
    }, [refreshProviderStatus]);

    // Enhanced event handlers with collision prevention
    function handleProviderAdded(args) {
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
            // Mark for update and schedule refresh
            invalidateUserCache(_account);
            scheduleUserUpdate(200);
        } else {
            // Another user became a provider
            addPersistentNotification('info', `🏢 New provider joined: ${_name} from ${_country}`);
        }
    }

    function handleProviderRemoved(args) {
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
            // Mark for update and schedule refresh
            invalidateUserCache(_account);
            scheduleUserUpdate(200);
        } else {
            // Another provider was removed
            addPersistentNotification('info', '🏢 A provider has left the platform');
        }
    }

    function handleProviderUpdated(args) {
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
            // Mark for update and schedule refresh
            invalidateUserCache(_account);
            scheduleUserUpdate(500); // Slightly longer delay for updates to batch them
        } else {
            // Another provider was updated
            devLog.log('📝 Provider updated:', _name, 'from', _country);
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
            invalidateUserCache,
            scheduleUserUpdate,
            isManualUpdateInProgress,
            setManualUpdateInProgress,
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