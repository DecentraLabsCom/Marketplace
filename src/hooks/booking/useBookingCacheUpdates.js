/**
 * Booking cache updates utilities for granular cache management
 * Used by booking event contexts and optimistic updates
 */

import { useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'
import { bookingQueryKeys } from '@/utils/hooks/queryKeys'

/**
 * Hook providing booking-specific cache update functions
 * @returns {Object} Cache update functions for bookings
 */
export function useBookingCacheUpdates() {
  const queryClient = useQueryClient()

  // Add new booking to cache
  const addBooking = useCallback((newBooking) => {
    // Update all bookings list
    queryClient.setQueryData(bookingQueryKeys.all(), (oldData) => {
      if (!oldData) return [newBooking]
      return [newBooking, ...oldData]
    })

    // Update user bookings if available
    if (newBooking.userAddress) {
      queryClient.setQueryData(
        bookingQueryKeys.byUser(newBooking.userAddress), 
        (oldData) => {
          if (!oldData) return [newBooking]
          return [newBooking, ...oldData]
        }
      )
    }

    // Update lab bookings if available
    if (newBooking.labId) {
      queryClient.setQueryData(
        bookingQueryKeys.byLab(newBooking.labId), 
        (oldData) => {
          if (!oldData) return [newBooking]
          return [newBooking, ...oldData]
        }
      )
    }
  }, [queryClient])

  // Update existing booking in cache
  const updateBooking = useCallback((reservationKey, updatedBooking) => {
    // Update all bookings list
    queryClient.setQueryData(bookingQueryKeys.all(), (oldData) => {
      if (!oldData) return []
      return oldData.map(booking => 
        booking.reservationKey === reservationKey ? { ...booking, ...updatedBooking } : booking
      )
    })

    // Update specific booking query
    queryClient.setQueryData(
      bookingQueryKeys.byReservationKey(reservationKey), 
      updatedBooking
    )
  }, [queryClient])

  // Remove booking from cache
  const removeBooking = useCallback((reservationKey) => {
    // Update all bookings list
    queryClient.setQueryData(bookingQueryKeys.all(), (oldData) => {
      if (!oldData) return []
      return oldData.filter(booking => booking.reservationKey !== reservationKey)
    })

    // Invalidate specific booking query
    queryClient.invalidateQueries({
      queryKey: bookingQueryKeys.byReservationKey(reservationKey)
    })
  }, [queryClient])

  // Invalidate all booking caches (fallback)
  const invalidateAllBookings = useCallback(() => {
    queryClient.invalidateQueries({
      queryKey: bookingQueryKeys.all()
    })
  }, [queryClient])

  return {
    addBooking,
    updateBooking,
    removeBooking,
    invalidateAllBookings
  }
}
