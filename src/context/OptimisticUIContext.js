/**
 * Optimistic UI Context
 * Manages local UI state for immediate user feedback while waiting for blockchain/server confirmation
 * This provides a clean separation between React Query cache (server state) and UI state (optimistic updates)
 */
"use client";
import React, { createContext, useContext, useState, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import PropTypes from 'prop-types'
import devLog from '@/utils/dev/logger'
import { labQueryKeys, bookingQueryKeys } from '@/utils/hooks/queryKeys'
import {
  RECONCILIATION_DEFAULTS,
  RECONCILIATION_SCHEDULE_MS,
  enqueueReconciliationEntry,
  readReconciliationQueue,
  removeReconciliationEntry,
  updateReconciliationQueue,
  buildNextAttemptAt,
} from '@/utils/optimistic/reconciliationQueue'

const OptimisticUIContext = createContext()

/**
 * Provider component for Optimistic UI state management
 * @param {Object} props
 * @param {React.ReactNode} props.children - Child components
 * @returns {JSX.Element} Context provider
 */
export function OptimisticUIProvider({ children }) {
  const queryClient = useQueryClient()
  // Lab listing states: { labId: { isListed: boolean, isPending: boolean, operation: 'listing'|'unlisting' } }
  const [labListingStates, setLabListingStates] = useState({})
  
  // Lab general states for other operations
  const [labStates, setLabStates] = useState({})

  // Booking optimistic states keyed by reservationKey or optimistic id
  const [bookingStates, setBookingStates] = useState({})

  /**
   * Set optimistic booking state
   * @param {string|number} bookingKey - reservationKey or optimistic id
   * @param {Object} state - state object, e.g., { status: 'requesting', isPending: true }
   */
  const setOptimisticBookingState = useCallback((bookingKey, state) => {
    const key = String(bookingKey);
    devLog.log(`🎯 [OptimisticUI] Setting optimistic booking state for ${key}:`, state)
    setBookingStates(prev => ({
      ...prev,
      [key]: {
        ...prev[key],
        ...state,
        timestamp: Date.now()
      }
    }))
    if (state?.isPending) {
      const queryKeys = [
        bookingQueryKeys.byReservationKey(key),
      ]
      const labId = state?.labId
      const userAddress = state?.userAddress && state?.userAddress !== 'unknown'
        ? state.userAddress
        : null
      if (labId !== null && labId !== undefined) {
        queryKeys.push(bookingQueryKeys.byLab(labId))
        queryKeys.push(bookingQueryKeys.getReservationsOfToken(labId))
        queryKeys.push({ queryKey: ['bookings', 'reservationOfToken', labId], exact: false })
      }
      if (userAddress) {
        queryKeys.push(bookingQueryKeys.byUser(userAddress))
        queryKeys.push(bookingQueryKeys.reservationsOf(userAddress))
        queryKeys.push({ queryKey: ['bookings', 'reservationKeyOfUser', userAddress], exact: false })
      }
      if (labId !== null && labId !== undefined && userAddress) {
        queryKeys.push(bookingQueryKeys.activeReservationKeyForUser(labId, userAddress))
        queryKeys.push(bookingQueryKeys.hasActiveBookingByToken(labId, userAddress))
        queryKeys.push(bookingQueryKeys.hasActiveBooking(key, userAddress))
      }
      if (state?.isInstitutional && labId !== null && labId !== undefined) {
        queryKeys.push(bookingQueryKeys.ssoActiveReservationKeySession(labId))
      }
      if (state?.isInstitutional) {
        queryKeys.push(bookingQueryKeys.ssoHasActiveBookingSession())
      }
      enqueueReconciliationEntry({
        id: `booking:${key}`,
        category: 'booking',
        queryKeys,
      })
    }
  }, [])

  /**
   * Complete optimistic booking state (mark non-pending but keep optimistic override)
   * @param {string|number} bookingKey
   */
  const completeOptimisticBookingState = useCallback((bookingKey) => {
    const key = String(bookingKey);
    devLog.log(`✅ [OptimisticUI] Completing optimistic booking state for ${key}`)
    setBookingStates(prev => {
      const current = prev[key]
      if (!current) return prev
      return {
        ...prev,
        [key]: {
          ...current,
          isPending: false,
          timestamp: Date.now()
        }
      }
    })
  }, [])

  /**
   * Clear optimistic booking state
   * @param {string|number} bookingKey
   */
  const clearOptimisticBookingState = useCallback((bookingKey) => {
    const key = String(bookingKey);
    devLog.log(`✅ [OptimisticUI] Clearing optimistic booking state for ${key}`)
    setBookingStates(prev => {
      const { [key]: removed, ...rest } = prev
      return rest
    })
    removeReconciliationEntry(`booking:${key}`)
  }, [])

  /**
   * Get effective booking state (optimistic overrides server)
   * @param {string|number} bookingKey
   * @param {Object} serverState
   */
  const getEffectiveBookingState = useCallback((bookingKey, serverState = {}) => {
    const key = String(bookingKey)
    const optimisticState = bookingStates[key]
    if (optimisticState) {
      return { ...serverState, ...optimisticState }
    }
    return serverState
  }, [bookingStates])

  /**
   * Set optimistic listing state for a lab
   * @param {string|number} labId - Lab ID
   * @param {boolean} isListed - Target listing state
   * @param {boolean} isPending - Whether operation is pending
   */
  const setOptimisticListingState = useCallback((labId, isListed, isPending = true) => {
    const key = String(labId);
    const operation = isListed ? 'listing' : 'unlisting'
    devLog.log(`🎯 [OptimisticUI] Setting ${operation} state for lab ${key}:`, { isListed, isPending })
    
    setLabListingStates(prev => ({
      ...prev,
      [key]: {
        isListed,
        isPending,
        operation,
        timestamp: Date.now()
      }
    }))
    enqueueReconciliationEntry({
      id: `lab:list:${key}`,
      category: 'lab-listing',
      expected: {
        queryKey: labQueryKeys.isTokenListed(key),
        field: 'isListed',
        value: isListed,
      },
      queryKeys: [
        labQueryKeys.isTokenListed(key),
        labQueryKeys.getLab(key),
      ],
    })
  }, [])

  /**
   * Complete optimistic operation (transaction succeeded, keep the new state but mark as non-pending)
   * @param {string|number} labId - Lab ID
   */
  const completeOptimisticListingState = useCallback((labId) => {
    const key = String(labId);
    devLog.log(`✅ [OptimisticUI] Completing optimistic state for lab ${key}`)
    
    setLabListingStates(prev => {
      const current = prev[key]
      if (!current) return prev
      
      return {
        ...prev,
        [key]: {
          ...current,
          isPending: false, // Transaction completed, keep the new state
          timestamp: Date.now()
        }
      }
    })
  }, [])

  /**
   * Clear optimistic state for a lab (when blockchain/server confirms)
   * @param {string|number} labId - Lab ID
   */
  const clearOptimisticListingState = useCallback((labId) => {
    const key = String(labId);
    devLog.log(`✅ [OptimisticUI] Clearing optimistic state for lab ${key}`)
    
    setLabListingStates(prev => {
      const { [key]: removed, ...rest } = prev
      return rest
    })
    removeReconciliationEntry(`lab:list:${key}`)
  }, [])

  /**
   * Get effective listing state for a lab (optimistic state overrides server state)
   * @param {string|number} labId - Lab ID
   * @param {boolean} serverIsListed - Server/cache state
   * @returns {Object} { isListed, isPending, operation }
   */
  const getEffectiveListingState = useCallback((labId, serverIsListed) => {
    const key = String(labId);
    const optimisticState = labListingStates[key]
    
    if (optimisticState) {
      // Use optimistic state
      devLog.log(`🎯 [OptimisticUI] Using optimistic state for lab ${key}:`, optimisticState);
      return {
        isListed: optimisticState.isListed,
        isPending: optimisticState.isPending,
        operation: optimisticState.operation
      }
    }
    
    // Use server state
    devLog.log(`📡 [OptimisticUI] Using server state for lab ${key}: isListed=${serverIsListed}`);
    return {
      isListed: serverIsListed || false,
      isPending: false,
      operation: null
    }
  }, [labListingStates])

  /**
   * Set general optimistic state for a lab
   * @param {string|number} labId - Lab ID
   * @param {Object} state - State object
   */
  const setOptimisticLabState = useCallback((labId, state) => {
    const key = String(labId);
    setLabStates(prev => ({
      ...prev,
      [key]: {
        ...prev[key],
        ...state,
        timestamp: Date.now()
      }
    }))
    if (state?.isPending) {
      enqueueReconciliationEntry({
        id: `lab:state:${key}`,
        category: 'lab-state',
        queryKeys: [
          labQueryKeys.getLab(key),
          labQueryKeys.getAllLabs(),
        ],
      })
    }
  }, [])

  /**
   * Clear general optimistic state for a lab
   * @param {string|number} labId - Lab ID
   */
  const clearOptimisticLabState = useCallback((labId) => {
    const key = String(labId);
    setLabStates(prev => {
      const { [key]: removed, ...rest } = prev
      return rest
    })
    removeReconciliationEntry(`lab:state:${key}`)
  }, [])

  /**
   * Get effective lab state (optimistic overrides server)
   * @param {string|number} labId - Lab ID
   * @param {Object} serverState - Server/cache state
   * @returns {Object} Effective state
   */
  const getEffectiveLabState = useCallback((labId, serverState = {}) => {
    const key = String(labId);
    const optimisticState = labStates[key]
    
    if (optimisticState) {
      return { ...serverState, ...optimisticState }
    }
    
    return serverState
  }, [labStates])

  // Auto-cleanup stale optimistic states
  React.useEffect(() => {
    const cleanup = () => {
      const now = Date.now()
      const maxAgePending = 2 * 60 * 1000 // 2 minutes for pending operations
      const maxAgeCompleted = 15 * 60 * 1000 // 15 minutes for completed operations
      
      // Clean listing states
      setLabListingStates(prev => {
        const cleaned = {}
        Object.entries(prev).forEach(([labId, state]) => {
          const maxAge = state.isPending ? maxAgePending : maxAgeCompleted
          if (now - state.timestamp < maxAge) {
            cleaned[labId] = state
          } else {
            devLog.log(`🧹 [OptimisticUI] Auto-cleaning ${state.isPending ? 'pending' : 'completed'} listing state for lab ${labId}`)
          }
        })
        return cleaned
      })
      
      // Clean general states
      setLabStates(prev => {
        const cleaned = {}
        Object.entries(prev).forEach(([labId, state]) => {
          const maxAge = state.isPending ? maxAgePending : maxAgeCompleted
          if (now - state.timestamp < maxAge) {
            cleaned[labId] = state
          } else {
            devLog.log(`🧹 [OptimisticUI] Auto-cleaning ${state.isPending ? 'pending' : 'completed'} lab state for lab ${labId}`)
          }
        })
        return cleaned
      })

      // Clean booking states
      setBookingStates(prev => {
        const cleaned = {}
        Object.entries(prev).forEach(([bookingKey, state]) => {
          const maxAge = state.isPending ? maxAgePending : maxAgeCompleted
          if (now - state.timestamp < maxAge) {
            cleaned[bookingKey] = state
          } else {
            devLog.log(`🧹 [OptimisticUI] Auto-cleaning ${state.isPending ? 'pending' : 'completed'} booking state for booking ${bookingKey}`)
          }
        })
        return cleaned
      })
    }
    
    const interval = setInterval(cleanup, 10000) // Check every 10 seconds
    return () => clearInterval(interval)
  }, [])

  React.useEffect(() => {
    const { checkIntervalMs } = RECONCILIATION_DEFAULTS

    const reconcileQueue = () => {
      const entries = readReconciliationQueue()
      if (!entries.length) return

      const now = Date.now()
      const updatedQueue = []

      entries.forEach((entry) => {
        if (!entry || !entry.id || !entry.queryKeys?.length) return

        if (entry.nextAttemptAt && entry.nextAttemptAt > now) {
          updatedQueue.push(entry)
          return
        }

        if (entry.expected?.queryKey) {
          const cached = queryClient.getQueryData(entry.expected.queryKey)
          if (cached && cached?.[entry.expected.field] === entry.expected.value) {
            return
          }
        }

        entry.queryKeys.forEach((item) => {
          const queryKey = item?.queryKey || item
          const exact = item?.exact ?? true
          if (!queryKey) return
          try {
            queryClient.invalidateQueries({
              queryKey,
              exact,
              refetchType: 'active',
            })
          } catch (err) {
            devLog.warn('Reconciliation invalidation failed:', err)
          }
        })

        const nextIndex = Number(entry.attemptIndex || 0) + 1
        if (nextIndex < RECONCILIATION_SCHEDULE_MS.length) {
          updatedQueue.push({
            ...entry,
            attemptIndex: nextIndex,
            nextAttemptAt: buildNextAttemptAt(entry.createdAt || now, nextIndex),
          })
        }
      })

      updateReconciliationQueue(updatedQueue)
    }

    reconcileQueue()
    const interval = setInterval(reconcileQueue, checkIntervalMs)
    return () => clearInterval(interval)
  }, [queryClient])

  const value = {
    // Listing-specific methods
    setOptimisticListingState,
    completeOptimisticListingState,
    clearOptimisticListingState,
    getEffectiveListingState,
    
    // General lab state methods
    setOptimisticLabState,
    clearOptimisticLabState,
    getEffectiveLabState,

    // Booking-specific methods
    setOptimisticBookingState,
    completeOptimisticBookingState,
    clearOptimisticBookingState,
    getEffectiveBookingState,
    
    // Direct state access (for debugging)
    labListingStates,
    labStates,
    bookingStates
  }

  return (
    <OptimisticUIContext.Provider value={value}>
      {children}
    </OptimisticUIContext.Provider>
  )
}

OptimisticUIProvider.propTypes = {
  children: PropTypes.node.isRequired
}

/**
 * Hook to access optimistic UI context
 * @returns {Object} Context value with optimistic UI methods
 */
export function useOptimisticUI() {
  const context = useContext(OptimisticUIContext)
  if (!context) {
    throw new Error('useOptimisticUI must be used within an OptimisticUIProvider')
  }
  return context
}

// Module loaded confirmation
devLog.moduleLoaded('✅ OptimisticUI context loaded')
