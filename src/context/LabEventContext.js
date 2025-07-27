"use client";
import { createContext, useContext, useState } from 'react'
import { useWatchContractEvent, useAccount } from 'wagmi'
import { useNotifications } from '@/context/NotificationContext'
import { useLabCacheInvalidation } from '@/hooks/lab/useLabs'
import { useCacheInvalidation } from '@/hooks/user/useUsers'
import { contractABI, contractAddresses } from '@/contracts/diamond'
import { selectChain } from '@/utils/blockchain/selectChain'
import devLog from '@/utils/dev/logger'
import PropTypes from 'prop-types'

const LabEventContext = createContext();

/**
 * Provider for lab-related blockchain events
 * @param {Object} props - Component props
 * @param {React.ReactNode} props.children - Child components
 */
export function LabEventProvider({ children }) {
    const { chain, address } = useAccount();
    const safeChain = selectChain(chain);
    const contractAddress = contractAddresses[safeChain.name.toLowerCase()];
    const labCacheInvalidation = useLabCacheInvalidation();
    const cacheInvalidation = useCacheInvalidation();
    const { addPersistentNotification } = useNotifications();
    const [processingLabs, setProcessingLabs] = useState(new Set());

    // Manual update coordination system (prevents UI + blockchain event duplicates)
    const [manualUpdateInProgress, setManualUpdateInProgress] = useState(false);

    // Function to check if manual update is in progress
    const isManualUpdateInProgress = manualUpdateInProgress;

    // Helper function to invalidate all lab-related caches
    const invalidateAllLabCaches = async (labId = null, reason = 'event') => {
        devLog.log(`♻️ [LabEventContext] Invalidating caches (reason: ${reason}):`, { labId });
        
        // Always invalidate all labs query
        labCacheInvalidation.invalidateLabList();

        // Also invalidate lab data if specific labId
        if (labId) {
            labCacheInvalidation.invalidateLabData(labId);
            
            // And invalidate bookings for this lab too since lab changes affect bookings
            cacheInvalidation.invalidateLabBookings(labId);
        }

        devLog.log(`✅ [LabEventContext] Cache invalidation completed`);
    };

    // LabCreated event listener
    useWatchContractEvent({
        address: contractAddress,
        abi: contractABI,
        eventName: 'LabCreated',
        onLogs: async (logs) => {
            if (manualUpdateInProgress) {
                devLog.log('[LabEventContext] Skipping LabCreated event - manual update in progress');
                return;
            }

            for (const log of logs) {
                try {
                    const { labId, owner } = log.args;
                    
                    devLog.log('🏗️ [LabEventContext] LabCreated event received:', {
                        labId: labId?.toString(),
                        owner,
                        timestamp: new Date().toISOString()
                    });

                    // Invalidate relevant caches
                    await invalidateAllLabCaches(labId?.toString(), 'lab_created');

                    // Show notification
                    addPersistentNotification(
                        `New lab created: Lab ${labId?.toString()}`,
                        'success',
                        5000
                    );

                } catch (error) {
                    devLog.error('❌ [LabEventContext] Error processing LabCreated event:', error);
                }
            }
        },
        enabled: !!contractAddress && !!address,
    });

    // LabStatusChanged event listener
    useWatchContractEvent({
        address: contractAddress,
        abi: contractABI,
        eventName: 'LabStatusChanged',
        onLogs: async (logs) => {
            if (manualUpdateInProgress) {
                devLog.log('[LabEventContext] Skipping LabStatusChanged event - manual update in progress');
                return;
            }

            for (const log of logs) {
                try {
                    const { labId, newStatus } = log.args;
                    
                    devLog.log('🔄 [LabEventContext] LabStatusChanged event received:', {
                        labId: labId?.toString(),
                        newStatus: newStatus?.toString(),
                        timestamp: new Date().toISOString()
                    });

                    // Invalidate relevant caches
                    await invalidateAllLabCaches(labId?.toString(), 'lab_status_changed');

                    // Show notification
                    addPersistentNotification(
                        `Lab ${labId?.toString()} status changed`,
                        'info',
                        5000
                    );

                } catch (error) {
                    devLog.error('❌ [LabEventContext] Error processing LabStatusChanged event:', error);
                }
            }
        },
        enabled: !!contractAddress && !!address,
    });

    // LabDeleted event listener
    useWatchContractEvent({
        address: contractAddress,
        abi: contractABI,
        eventName: 'LabDeleted',
        onLogs: async (logs) => {
            if (manualUpdateInProgress) {
                devLog.log('[LabEventContext] Skipping LabDeleted event - manual update in progress');
                return;
            }

            for (const log of logs) {
                try {
                    const { labId } = log.args;
                    
                    devLog.log('🗑️ [LabEventContext] LabDeleted event received:', {
                        labId: labId?.toString(),
                        timestamp: new Date().toISOString()
                    });

                    // Invalidate all relevant caches, including bookings
                    await invalidateAllLabCaches(labId?.toString(), 'lab_deleted');
                    
                    // Also invalidate user bookings since they might reference the deleted lab
                    cacheInvalidation.invalidateAllBookings();

                    // Show notification
                    addPersistentNotification(
                        `Lab ${labId?.toString()} has been deleted`,
                        'warning',
                        5000
                    );

                } catch (error) {
                    devLog.error('❌ [LabEventContext] Error processing LabDeleted event:', error);
                }
            }
        },
        enabled: !!contractAddress && !!address,
    });

    const value = {
        processingLabs,
        setProcessingLabs,
        isManualUpdateInProgress,
        setManualUpdateInProgress,
        invalidateAllLabCaches
    };

    return (
        <LabEventContext.Provider value={value}>
            {children}
        </LabEventContext.Provider>
    );
}

export function useLabEvents() {
    const context = useContext(LabEventContext);
    if (!context) {
        throw new Error('useLabEvents must be used within a LabEventProvider');
    }
    return context;
}

// PropTypes
LabEventProvider.propTypes = {
    children: PropTypes.node.isRequired,
};
