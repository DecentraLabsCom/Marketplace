"use client";
import { createContext, useContext, useRef } from 'react'
import { useWatchContractEvent, useAccount } from 'wagmi'
import { useQueryClient } from '@tanstack/react-query'
import { bookingQueryKeys } from '@/utils/hooks/queryKeys'
import { contractABI, contractAddresses } from '@/contracts/diamond'
import { selectChain } from '@/utils/blockchain/selectChain'
import { useConfirmReservationRequest } from '@/hooks/booking/useBookings'
import { useUser } from '@/context/UserContext'
import { useNotifications } from '@/context/NotificationContext'
import devLog from '@/utils/dev/logger'
import PropTypes from 'prop-types'

const BookingEventContext = createContext();

/**
 * Simplified Booking Event Provider
 * Only handles blockchain events and validates/updates React Query cache
 * @param {Object} props - Component props
 * @param {React.ReactNode} props.children - Child components
 */
export function BookingEventProvider({ children }) {
    const { chain, address } = useAccount();
    const safeChain = selectChain(chain);
    const contractAddress = contractAddresses[safeChain.name.toLowerCase()];
    const queryClient = useQueryClient();
    // Use mutation for server-side confirmation
    const confirmReservationMutation = useConfirmReservationRequest();
    
    // User context and notifications for smart user targeting
    const { address: userAddress, isSSO } = useUser();
    const { addTemporaryNotification } = useNotifications();

    // DEDUPLICATION: Track processed reservations to prevent duplicates from multiple RPC providers
    const processedReservations = useRef(new Set());
    const processingReservations = useRef(new Map()); // Track in-flight confirmations

    // Helper function to validate and auto-confirm reservation requests using SSO server wallet
    const validateAndConfirmReservation = async (reservationKey, tokenId, requester, start, end) => {
        devLog.log(`🔍 [BookingEventContext] Starting validateAndConfirmReservation for ${reservationKey}`);
        // DEDUPLICATION: Check FIRST if this unique reservation was already processed
        if (processedReservations.current.has(reservationKey)) {
            devLog.warn(`🔄 [BookingEventContext] Reservation ${reservationKey} already processed. Skipping duplicate.`);
            return;
        }
        
        // Check if currently being processed (race condition from multiple providers)
        if (processingReservations.current.has(reservationKey)) {
            devLog.warn(`⏳ [BookingEventContext] Reservation ${reservationKey} is currently being processed. Skipping duplicate.`);
            return;
        }
        
        // Mark as being processed IMMEDIATELY to prevent race conditions
        processingReservations.current.set(reservationKey, Date.now());
        
        // Add small delay to allow multiple duplicate events to arrive and be filtered
        await new Promise(resolve => setTimeout(resolve, 80));
        
        // Determine if this reservation belongs to the current user
        const currentUserAddress = address || userAddress;
        const isCurrentUserReservation = requester && currentUserAddress && 
            requester.toLowerCase() === currentUserAddress.toLowerCase();
        
        devLog.log(`� [BookingEventContext] Checking user match:`, {
            requester,
            currentUserAddress,
            isMatch: isCurrentUserReservation
        });
    
        try {
            // Clean up old entries from processed set (keep only last 10 when we exceed 20)
            if (processedReservations.current.size > 20) {
                const entries = Array.from(processedReservations.current);
                // Remove oldest entries, keep only the most recent 10
                entries.slice(0, entries.length - 10).forEach(key => {
                    processedReservations.current.delete(key);
                });
            }
            
            // Clean up stale processing entries (older than 30 seconds)
            const nowMs = Date.now();
            for (const [key, timestamp] of processingReservations.current.entries()) {
                if (nowMs - timestamp > 30000) {
                    processingReservations.current.delete(key);
                    devLog.warn(`🧹 [BookingEventContext] Cleaned up stale processing entry for ${key}`);
                }
            }

            // Validate that reservation is in a valid period (not in the past)
            const now = Math.floor(Date.now() / 1000);
            const startTime = parseInt(start);
            const endTime = parseInt(end);
            
            if (startTime < now) {
                devLog.warn(`⚠️ [BookingEventContext] Reservation ${reservationKey} start time ${startTime} is in the past (current: ${now}). Not auto-confirming.`);
                return;
            }
            
            if (endTime <= startTime) {
                devLog.warn(`⚠️ [BookingEventContext] Reservation ${reservationKey} has invalid time range (end ${endTime} <= start ${startTime}). Not auto-confirming.`);
                return;
            }
            
            // Check if SSO mutation is available
            if (!confirmReservationMutation) {
                devLog.error(`❌ [BookingEventContext] confirmReservationMutation (SSO) is not available for reservation ${reservationKey}`);
                devLog.error(`❌ [BookingEventContext] This indicates the hook useConfirmReservationRequest may not be mounted or failed to initialize`);
                return;
            }

            devLog.log(`🚀 [BookingEventContext] About to call mutateAsync for reservation ${reservationKey}`);

            // Auto-confirm the reservation using SSO server wallet (transparent to user)
            devLog.log(`🔄 [BookingEventContext] Auto-confirming reservation ${reservationKey} for lab ${tokenId} via SSO server wallet`);
            
            const result = await confirmReservationMutation.mutateAsync(reservationKey);
            
            devLog.log(`✅ [BookingEventContext] Successfully auto-confirmed reservation ${reservationKey} via server wallet`, result);
            
            // Show success notification to current user
            // Use setTimeout to avoid setState during render
            if (isCurrentUserReservation) {
                setTimeout(() => {
                    addTemporaryNotification('success', '✅ Reservation confirmed and ready!');
                }, 0);
            }

            // Mark as successfully processed
            processedReservations.current.add(reservationKey);
            processingReservations.current.delete(reservationKey);
            
            // Don't refetch here - the blockchain transaction hasn't been mined yet
            // The ReservationConfirmed event will handle the refetch when the transaction is confirmed
        } catch (error) {
            devLog.error(`❌ [BookingEventContext] Failed to auto-confirm reservation ${reservationKey} via server wallet:`, error);
            
            // Remove from processing (allow retry on next event if it was a transient error)
            processingReservations.current.delete(reservationKey);
            
            // Only mark as processed if it's already confirmed (not a transient network error)
            if (error.message?.includes('already confirmed') || error.message?.includes('Reservation already confirmed')) {
                processedReservations.current.add(reservationKey);
                devLog.log(`ℹ️ [BookingEventContext] Reservation ${reservationKey} already confirmed, marked as processed`);
            }
            
            // Show error notification only to the user who made the reservation
            // Use setTimeout to avoid setState during render
            // Only show if it's NOT an "already confirmed" situation
            if (isCurrentUserReservation && !error.message?.includes('already confirmed')) {
                setTimeout(() => {
                    addTemporaryNotification('error', '❌ Reservation denied. Try again later.');
                }, 0);
            }
        }
    };

    // ReservationRequested event listener
    useWatchContractEvent({
        address: contractAddress,
        abi: contractABI,
        eventName: 'ReservationRequested',
        enabled: !!contractAddress && !!safeChain.id, // Only enable when we have valid address
        onLogs: (logs) => {
            devLog.log('📝 [BookingEventContext] ReservationRequested events detected:', {
                eventCount: logs.length,
                contractAddress,
                chainId: safeChain.id,
                chainName: safeChain.name,
                currentUserAddress: address || userAddress
            });
            
            // Process each reservation request
            logs.forEach(async (log, index) => {                
                const { reservationKey, renter, tokenId, start, end } = log.args;
                const reservationKeyStr = reservationKey?.toString();
                const tokenIdStr = tokenId?.toString();
                const requester = renter?.toString();
                const startStr = start?.toString();
                const endStr = end?.toString();
                
                devLog.log(`📝 [BookingEventContext] Processing ReservationRequested #${index + 1}:`, {
                    reservationKey: reservationKeyStr,
                    tokenId: tokenIdStr,
                    renter: requester,
                    start: startStr,
                    end: endStr,
                    rawArgs: log.args
                });
                
                // NOTE: No refetch here - ReservationRequested is just a request, not a confirmation
                // The actual state change happens in ReservationConfirmed event
                // We only auto-confirm the reservation via server wallet
                
                // Auto-confirm reservation if valid
                if (reservationKeyStr && tokenIdStr && startStr && endStr) {
                    await validateAndConfirmReservation(reservationKeyStr, tokenIdStr, requester, startStr, endStr);
                }
            });
        }
    });

    // ReservationConfirmed event listener
    useWatchContractEvent({
        address: contractAddress,
        abi: contractABI,
        eventName: 'ReservationConfirmed',
        enabled: !!contractAddress && !!safeChain.id, // Only enable when we have valid address
        chainId: safeChain.id,
        onLogs: (logs) => {
            devLog.log('✅ [BookingEventContext] ReservationConfirmed events detected:', logs.length);
            
            logs.forEach(async (log, index) => {
                const { reservationKey, tokenId } = log.args;
                const reservationKeyStr = reservationKey?.toString();
                const tokenIdStr = tokenId?.toString();
                
                devLog.log(`✅ [BookingEventContext] Processing ReservationConfirmed #${index + 1}:`, {
                    reservationKey: reservationKeyStr,
                    tokenId: tokenIdStr,
                    rawArgs: log.args
                });
                
                // Invalidate all booking queries
                if (reservationKeyStr) {
                    devLog.log('🔄 Invalidating all booking queries for confirmed reservation:', reservationKeyStr);
                    
                    // Invalidate the main bookings cache (this includes optimistic bookings)
                    queryClient.invalidateQueries({ 
                        queryKey: bookingQueryKeys.all() 
                    });
                }
            });
        }
    });

    // BookingCanceled event listener
    useWatchContractEvent({
        address: contractAddress,
        abi: contractABI,
        eventName: 'BookingCanceled',
        enabled: !!contractAddress && !!safeChain.id, // Only enable when we have valid address
        chainId: safeChain.id,
        onLogs: (logs) => {
            devLog.log('❌ [BookingEventContext] BookingCanceled events detected:', logs.length);
            
            logs.forEach(async (log) => {
                const { reservationKey, tokenId } = log.args;
                const reservationKeyStr = reservationKey?.toString();
                const tokenIdStr = tokenId?.toString();
                
                // Refetch queries to force immediate update
                if (reservationKeyStr) {
                    queryClient.refetchQueries({ 
                        queryKey: bookingQueryKeys.byReservationKey(reservationKeyStr) 
                    });
                    
                    // Refetch specific lab bookings queries using tokenId
                    if (tokenIdStr) {
                        queryClient.refetchQueries({ 
                            queryKey: bookingQueryKeys.getReservationsOfToken(tokenIdStr) 
                        });
                        queryClient.refetchQueries({ 
                            queryKey: bookingQueryKeys.hasActiveBookingByToken(tokenIdStr) 
                        });
                    }
                }
            });
        }
    });

    // ReservationRequestCanceled event listener
    useWatchContractEvent({
        address: contractAddress,
        abi: contractABI,
        eventName: 'ReservationRequestCanceled',
        enabled: !!contractAddress && !!safeChain.id, // Only enable when we have valid address
        chainId: safeChain.id,
        onLogs: (logs) => {
            devLog.log('🚫 [BookingEventContext] ReservationRequestCanceled events detected:', logs.length);
            
            logs.forEach(async (log) => {
                const { reservationKey, tokenId } = log.args;
                const reservationKeyStr = reservationKey?.toString();
                const tokenIdStr = tokenId?.toString();
                
                // Refetch queries to force immediate update
                if (reservationKeyStr) {
                    queryClient.refetchQueries({ 
                        queryKey: bookingQueryKeys.byReservationKey(reservationKeyStr) 
                    });
                    
                    // Refetch specific lab bookings queries using tokenId
                    if (tokenIdStr) {
                        queryClient.refetchQueries({ 
                            queryKey: bookingQueryKeys.getReservationsOfToken(tokenIdStr) 
                        });
                        queryClient.refetchQueries({ 
                            queryKey: bookingQueryKeys.hasActiveBookingByToken(tokenIdStr) 
                        });
                    }
                }
            });
        }
    });

    // ReservationRequestDenied event listener
    useWatchContractEvent({
        address: contractAddress,
        abi: contractABI,
        eventName: 'ReservationRequestDenied',
        enabled: !!contractAddress && !!safeChain.id, // Only enable when we have valid address
        chainId: safeChain.id,
        onLogs: (logs) => {
            devLog.log('⛔ [BookingEventContext] ReservationRequestDenied events detected:', logs.length);
            
            logs.forEach(async (log) => {
                const { reservationKey, tokenId } = log.args;
                const reservationKeyStr = reservationKey?.toString();
                const tokenIdStr = tokenId?.toString();
                
                // Refetch queries to force immediate update
                if (reservationKeyStr) {
                    queryClient.refetchQueries({ 
                        queryKey: bookingQueryKeys.byReservationKey(reservationKeyStr) 
                    });
                    
                    // Refetch specific lab bookings queries using tokenId
                    if (tokenIdStr) {
                        queryClient.refetchQueries({ 
                            queryKey: bookingQueryKeys.getReservationsOfToken(tokenIdStr) 
                        });
                        queryClient.refetchQueries({ 
                            queryKey: bookingQueryKeys.hasActiveBookingByToken(tokenIdStr) 
                        });
                    }
                }
            });
        }
    });


    return (
        <BookingEventContext.Provider value={{}}>
            {children}
        </BookingEventContext.Provider>
    );
}

BookingEventProvider.propTypes = {
    children: PropTypes.node.isRequired,
};

/**
 * Hook to use the Booking Event Context
 * @returns {Object} Booking event context value
 */
export function useBookingEventContext() {
    const context = useContext(BookingEventContext);
    if (context === undefined) {
        throw new Error('useBookingEventContext must be used within a BookingEventProvider');
    }
    return context;
}