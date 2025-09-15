"use client";
import { createContext, useContext } from 'react'
import { useWatchContractEvent, useAccount } from 'wagmi'
import { useQueryClient } from '@tanstack/react-query'
import { bookingQueryKeys } from '@/utils/hooks/queryKeys'
import { contractABI, contractAddresses } from '@/contracts/diamond'
import { selectChain } from '@/utils/blockchain/selectChain'
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
    const { chain } = useAccount();
    const safeChain = selectChain(chain);
    const contractAddress = contractAddresses[safeChain.name.toLowerCase()];
    const queryClient = useQueryClient();

    // ReservationRequested event listener (corrigiendo nombre del ABI)
    useWatchContractEvent({
        address: contractAddress,
        abi: contractABI,
        eventName: 'ReservationRequested',
        enabled: !!contractAddress && !!safeChain.id, // Only enable when we have valid address
        onLogs: (logs) => {
            devLog.log('📝 [BookingEventContext] ReservationRequested events detected:', logs.length);
            
            // Simple invalidation - let React Query handle the rest
            queryClient.invalidateQueries({ 
                queryKey: bookingQueryKeys.all() 
            });
            
            // Invalidate specific booking queries if we have data
            logs.forEach(log => {
                const { _reservationKey, _requester, _tokenId } = log.args;
                const reservationKey = _reservationKey?.toString();
                const tokenId = _tokenId?.toString();
                
                if (reservationKey) {
                    queryClient.invalidateQueries({ 
                        queryKey: bookingQueryKeys.byReservationKey(reservationKey) 
                    });
                }
                
                if (tokenId) {
                    queryClient.invalidateQueries({ 
                        queryKey: bookingQueryKeys.getReservationsOfToken(tokenId) 
                    });
                    queryClient.invalidateQueries({ 
                        queryKey: bookingQueryKeys.hasActiveBookingByToken(tokenId) 
                    });
                }
                
                if (_requester) {
                    queryClient.invalidateQueries({ 
                        queryKey: bookingQueryKeys.reservationsOf(_requester) 
                    });
                    queryClient.invalidateQueries({ 
                        queryKey: bookingQueryKeys.hasActiveBooking(_requester) 
                    });
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
        onLogs: (logs) => {
            devLog.log('✅ [BookingEventContext] ReservationConfirmed events detected:', logs.length);
            
            queryClient.invalidateQueries({ 
                queryKey: bookingQueryKeys.all() 
            });
            
            logs.forEach(log => {
                const { _reservationKey, _tokenId } = log.args;
                const reservationKey = _reservationKey?.toString();
                const tokenId = _tokenId?.toString();
                
                if (reservationKey) {
                    queryClient.invalidateQueries({ 
                        queryKey: bookingQueryKeys.byReservationKey(reservationKey) 
                    });
                }
                
                if (tokenId) {
                    queryClient.invalidateQueries({ 
                        queryKey: bookingQueryKeys.getReservationsOfToken(tokenId) 
                    });
                    queryClient.invalidateQueries({ 
                        queryKey: bookingQueryKeys.hasActiveBookingByToken(tokenId) 
                    });
                }
            });
        }
    });

    // ReservationCanceled event listener
    useWatchContractEvent({
        address: contractAddress,
        abi: contractABI,
        eventName: 'ReservationCanceled',
        enabled: !!contractAddress && !!safeChain.id, // Only enable when we have valid address
        onLogs: (logs) => {
            devLog.log('❌ [BookingEventContext] ReservationCanceled events detected:', logs.length);
            
            queryClient.invalidateQueries({ 
                queryKey: bookingQueryKeys.all() 
            });
            
            logs.forEach(log => {
                const { _reservationKey, _tokenId } = log.args;
                const reservationKey = _reservationKey?.toString();
                const tokenId = _tokenId?.toString();
                
                if (reservationKey) {
                    queryClient.invalidateQueries({ 
                        queryKey: bookingQueryKeys.byReservationKey(reservationKey) 
                    });
                }
                
                if (tokenId) {
                    queryClient.invalidateQueries({ 
                        queryKey: bookingQueryKeys.getReservationsOfToken(tokenId) 
                    });
                    queryClient.invalidateQueries({ 
                        queryKey: bookingQueryKeys.hasActiveBookingByToken(tokenId) 
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
        onLogs: (logs) => {
            devLog.log('❌ [BookingEventContext] BookingCanceled events detected:', logs.length);
            
            queryClient.invalidateQueries({ 
                queryKey: bookingQueryKeys.all() 
            });
            
            logs.forEach(log => {
                const { _reservationKey, _tokenId } = log.args;
                const reservationKey = _reservationKey?.toString();
                const tokenId = _tokenId?.toString();
                
                if (reservationKey) {
                    queryClient.invalidateQueries({ 
                        queryKey: bookingQueryKeys.byReservationKey(reservationKey) 
                    });
                }
                
                if (tokenId) {
                    queryClient.invalidateQueries({ 
                        queryKey: bookingQueryKeys.getReservationsOfToken(tokenId) 
                    });
                    queryClient.invalidateQueries({ 
                        queryKey: bookingQueryKeys.hasActiveBookingByToken(tokenId) 
                    });
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
        onLogs: (logs) => {
            devLog.log('🚫 [BookingEventContext] ReservationRequestCanceled events detected:', logs.length);
            
            queryClient.invalidateQueries({ 
                queryKey: bookingQueryKeys.all() 
            });
            
            logs.forEach(log => {
                const { _reservationKey, _tokenId } = log.args;
                const reservationKey = _reservationKey?.toString();
                const tokenId = _tokenId?.toString();
                
                if (reservationKey) {
                    queryClient.invalidateQueries({ 
                        queryKey: bookingQueryKeys.byReservationKey(reservationKey) 
                    });
                }
                
                if (tokenId) {
                    queryClient.invalidateQueries({ 
                        queryKey: bookingQueryKeys.getReservationsOfToken(tokenId) 
                    });
                    queryClient.invalidateQueries({ 
                        queryKey: bookingQueryKeys.hasActiveBookingByToken(tokenId) 
                    });
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
        onLogs: (logs) => {
            devLog.log('⛔ [BookingEventContext] ReservationRequestDenied events detected:', logs.length);
            
            queryClient.invalidateQueries({ 
                queryKey: bookingQueryKeys.all() 
            });
            
            logs.forEach(log => {
                const { _reservationKey, _tokenId } = log.args;
                const reservationKey = _reservationKey?.toString();
                const tokenId = _tokenId?.toString();
                
                if (reservationKey) {
                    queryClient.invalidateQueries({ 
                        queryKey: bookingQueryKeys.byReservationKey(reservationKey) 
                    });
                }
                
                if (tokenId) {
                    queryClient.invalidateQueries({ 
                        queryKey: bookingQueryKeys.getReservationsOfToken(tokenId) 
                    });
                    queryClient.invalidateQueries({ 
                        queryKey: bookingQueryKeys.hasActiveBookingByToken(tokenId) 
                    });
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