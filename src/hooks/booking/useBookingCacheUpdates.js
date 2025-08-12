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
    const key = reservationKey || updatedBooking?.reservationKey || updatedBooking?.id;
    // Update all bookings list
    queryClient.setQueryData(bookingQueryKeys.all(), (oldData) => {
      if (!oldData) return []
      return oldData.map(booking => 
        (booking.reservationKey === key || booking.id === key) ? { ...booking, ...updatedBooking } : booking
      )
    })

    // Update specific booking query
    if (key) {
      queryClient.setQueryData(
        bookingQueryKeys.byReservationKey(key), 
        updatedBooking
      )
    }
  }, [queryClient])

  // Remove booking from cache
  const removeBooking = useCallback((reservationKey) => {
    const key = reservationKey
    // Update all bookings list
    queryClient.setQueryData(bookingQueryKeys.all(), (oldData) => {
      if (!oldData) return []
      return oldData.filter(booking => booking.reservationKey !== key && booking.id !== key)
    })

    // Invalidate specific booking query
    if (key) {
      queryClient.invalidateQueries({
        queryKey: bookingQueryKeys.byReservationKey(key)
      })
    }
  }, [queryClient])

  // Invalidate all booking caches (fallback)
  const invalidateAllBookings = useCallback(() => {
    queryClient.invalidateQueries({
      queryKey: bookingQueryKeys.all()
    })
  }, [queryClient])

  // Granular invalidation helper used by BookingEventContext
  const smartBookingInvalidation = useCallback((userAddress = null, labId = null, bookingData = null, action = null) => {
    try {
      // If we have enough data, try targeted cache updates first
      if (bookingData && action) {
        const key = bookingData.reservationKey || bookingData.id
        if (action === 'add') addBooking(bookingData)
        else if (action === 'update' && key) updateBooking(key, bookingData)
        else if (action === 'remove' && key) removeBooking(key)
      }

      // Invalidate user and lab specific caches if keys are provided
      if (userAddress) {
        queryClient.invalidateQueries({ queryKey: bookingQueryKeys.byUser(userAddress) })
      }
      if (labId) {
        queryClient.invalidateQueries({ queryKey: bookingQueryKeys.byLab(labId) })
      }
    } catch (e) {
      // Fallback to targeted invalidation on error
      if (userAddress) {
        queryClient.invalidateQueries({ queryKey: bookingQueryKeys.byUser(userAddress) })
      }
      if (labId) {
        queryClient.invalidateQueries({ queryKey: bookingQueryKeys.byLab(labId) })
      }
    }
  }, [addBooking, updateBooking, removeBooking, invalidateAllBookings, queryClient])

  return {
    addBooking,
    updateBooking,
    removeBooking,
    invalidateAllBookings,
    smartBookingInvalidation,
  }
}
