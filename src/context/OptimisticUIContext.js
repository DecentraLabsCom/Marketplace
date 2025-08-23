/**
 * Optimistic UI Context
 * Manages local UI state for immediate user feedback while waiting for blockchain/server confirmation
 * This provides a clean separation between React Query cache (server state) and UI state (optimistic updates)
 */
"use client";
import React, { createContext, useContext, useState, useCallback } from 'react'
import PropTypes from 'prop-types'
import devLog from '@/utils/dev/logger'

const OptimisticUIContext = createContext()

/**
 * Provider component for Optimistic UI state management
 * @param {Object} props
 * @param {React.ReactNode} props.children - Child components
 * @returns {JSX.Element} Context provider
 */
export function OptimisticUIProvider({ children }) {
  // Lab listing states: { labId: { isListed: boolean, isPending: boolean, operation: 'listing'|'unlisting' } }
  const [labListingStates, setLabListingStates] = useState({})
  
  // Lab general states for other operations
  const [labStates, setLabStates] = useState({})

  /**
   * Set optimistic listing state for a lab
   * @param {string|number} labId - Lab ID
   * @param {boolean} isListed - Target listing state
   * @param {boolean} isPending - Whether operation is pending
   */
  const setOptimisticListingState = useCallback((labId, isListed, isPending = true) => {
    const operation = isListed ? 'listing' : 'unlisting'
    devLog.log(`🎯 [OptimisticUI] Setting ${operation} state for lab ${labId}:`, { isListed, isPending })
    
    setLabListingStates(prev => ({
      ...prev,
      [labId]: {
        isListed,
        isPending,
        operation,
        timestamp: Date.now()
      }
    }))
  }, [])

  /**
   * Complete optimistic operation (transaction succeeded, keep the new state but mark as non-pending)
   * @param {string|number} labId - Lab ID
   */
  const completeOptimisticListingState = useCallback((labId) => {
    devLog.log(`✅ [OptimisticUI] Completing optimistic state for lab ${labId}`)
    
    setLabListingStates(prev => {
      const current = prev[labId]
      if (!current) return prev
      
      return {
        ...prev,
        [labId]: {
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
    devLog.log(`✅ [OptimisticUI] Clearing optimistic state for lab ${labId}`)
    
    setLabListingStates(prev => {
      const { [labId]: removed, ...rest } = prev
      return rest
    })
  }, [])

  /**
   * Get effective listing state for a lab (optimistic state overrides server state)
   * @param {string|number} labId - Lab ID
   * @param {boolean} serverIsListed - Server/cache state
   * @returns {Object} { isListed, isPending, operation }
   */
  const getEffectiveListingState = useCallback((labId, serverIsListed) => {
    const optimisticState = labListingStates[labId]
    
    if (optimisticState) {
      // Use optimistic state
      return {
        isListed: optimisticState.isListed,
        isPending: optimisticState.isPending,
        operation: optimisticState.operation
      }
    }
    
    // Use server state
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
    setLabStates(prev => ({
      ...prev,
      [labId]: {
        ...prev[labId],
        ...state,
        timestamp: Date.now()
      }
    }))
  }, [])

  /**
   * Clear general optimistic state for a lab
   * @param {string|number} labId - Lab ID
   */
  const clearOptimisticLabState = useCallback((labId) => {
    setLabStates(prev => {
      const { [labId]: removed, ...rest } = prev
      return rest
    })
  }, [])

  /**
   * Get effective lab state (optimistic overrides server)
   * @param {string|number} labId - Lab ID
   * @param {Object} serverState - Server/cache state
   * @returns {Object} Effective state
   */
  const getEffectiveLabState = useCallback((labId, serverState = {}) => {
    const optimisticState = labStates[labId]
    
    if (optimisticState) {
      return { ...serverState, ...optimisticState }
    }
    
    return serverState
  }, [labStates])

  // Auto-cleanup stale optimistic states (older than 10 minutes for completed, 1 minute for pending)
  React.useEffect(() => {
    const cleanup = () => {
      const now = Date.now()
      const maxAgePending = 60 * 1000 // 1 minute for pending operations
      const maxAgeCompleted = 10 * 60 * 1000 // 10 minutes for completed operations
      
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
          if (now - state.timestamp < maxAge) {
            cleaned[labId] = state
          } else {
            devLog.log(`🧹 [OptimisticUI] Auto-cleaning stale lab state for lab ${labId}`)
          }
        })
        return cleaned
      })
    }
    
    const interval = setInterval(cleanup, 10000) // Check every 10 seconds
    return () => clearInterval(interval)
  }, [])

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
    
    // Direct state access (for debugging)
    labListingStates,
    labStates
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
