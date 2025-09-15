"use client";
import React, { createContext, useContext, useMemo, useRef, useCallback } from 'react';
import PropTypes from 'prop-types';
import { useLabTokenHook } from '@/hooks/useLabToken';
import devLog from '@/utils/dev/logger';

// Create the context
const LabTokenContext = createContext(null);

/**
 * LabTokenProvider component that provides LAB token data to all child components
 * Uses a single instance of useLabToken to avoid multiple contract calls
 * @param {Object} props
 * @param {React.ReactNode} props.children - Child components
 */
export function LabTokenProvider({ children }) {
  // Single instance of useLabToken - this is the only place it's called
  const labTokenData = useLabTokenHook();
  
  // Track last logged state to prevent duplicate logs
  const lastLoggedState = useRef({
    balance: 'initial',
    decimals: 'initial', 
    isLoading: 'initial'
  });
  
  // Track last context value to prevent unnecessary re-renders
  const lastContextValue = useRef(null);
  
  // Create stable function references using useCallback
  const stableFunctions = useMemo(() => ({
    calculateReservationCost: labTokenData.calculateReservationCost,
    approveLabTokens: labTokenData.approveLabTokens,
    checkBalanceAndAllowance: labTokenData.checkBalanceAndAllowance,
    checkSufficientBalance: labTokenData.checkSufficientBalance,
    formatTokenAmount: labTokenData.formatTokenAmount,
    formatPrice: labTokenData.formatPrice,
    refreshTokenData: labTokenData.refreshTokenData,
    refetchBalance: labTokenData.refetchBalance,
    refetchAllowance: labTokenData.refetchAllowance,
    clearDecimalsCache: labTokenData.clearDecimalsCache
  }), [
    labTokenData.calculateReservationCost,
    labTokenData.approveLabTokens,
    labTokenData.checkBalanceAndAllowance,
    labTokenData.checkSufficientBalance,
    labTokenData.formatTokenAmount,
    labTokenData.formatPrice,
    labTokenData.refreshTokenData,
    labTokenData.refetchBalance,
    labTokenData.refetchAllowance,
    labTokenData.clearDecimalsCache
  ]);
  
  // Memoize the context value to prevent unnecessary re-renders
  // Only depend on serialized values to avoid object reference changes
  const contextValue = useMemo(() => {
    // Convert values to serializable format for comparison
    const currentState = {
      balance: labTokenData.balance?.toString() || 'undefined',
      decimals: labTokenData.decimals,
      isLoading: labTokenData.isLoading,
      labTokenAddress: labTokenData.labTokenAddress
    };
    
    // Check if this is actually a new value compared to the last one
    if (lastContextValue.current) {
      const lastState = lastContextValue.current;
      const isSameAsLast = (
        lastState.balance?.toString() === currentState.balance &&
        lastState.decimals === currentState.decimals &&
        lastState.isLoading === currentState.isLoading &&
        lastState.labTokenAddress === currentState.labTokenAddress &&
        lastState.allowance?.toString() === labTokenData.allowance?.toString()
      );
      
      // If nothing changed, return the same object reference to prevent re-renders
      if (isSameAsLast) {
        return lastContextValue.current;
      }
    }
    
    // Check if we should log this change
    const hasChanged = (
      currentState.balance !== lastLoggedState.current.balance ||
      currentState.decimals !== lastLoggedState.current.decimals ||
      currentState.isLoading !== lastLoggedState.current.isLoading
    );
    
    // Skip logging if we're just repeatedly getting undefined values  
    const isJustUndefinedSpam = (
      currentState.balance === 'undefined' &&
      currentState.decimals === undefined &&
      currentState.isLoading === false &&
      lastLoggedState.current.balance === 'undefined'
    );
    
    // Only log meaningful changes - be more restrictive
    const shouldLog = hasChanged && !isJustUndefinedSpam && (
      // Log if we have real data (balance is defined and not zero, decimals are defined)
      (currentState.balance !== 'undefined' && currentState.decimals != null && currentState.decimals !== undefined) ||
      // Or if loading state changed to/from true (not undefined->false)
      (currentState.isLoading === true || (lastLoggedState.current.isLoading === true && currentState.isLoading === false))
    );
    
    if (shouldLog) {
      devLog.log('LabTokenContext: Context value updated', currentState);
      lastLoggedState.current = { ...currentState };
    }
    
    // Always update lastLoggedState when there are changes to prevent repeated logs
    if (hasChanged) {
      lastLoggedState.current = { ...currentState };
    }

    const newContextValue = {
      // Token state - these values changing should trigger updates
      balance: labTokenData.balance,
      allowance: labTokenData.allowance,
      decimals: labTokenData.decimals,
      isLoading: labTokenData.isLoading,
      labTokenAddress: labTokenData.labTokenAddress,
      
      // Token functions - use stable references
      ...stableFunctions
    };
    
    // Store reference for next comparison
    lastContextValue.current = newContextValue;
    
    return newContextValue;
  }, [
    labTokenData.balance?.toString() || 'undefined',
    labTokenData.allowance?.toString() || 'undefined', 
    labTokenData.decimals ?? 'undefined',
    Boolean(labTokenData.isLoading),
    labTokenData.labTokenAddress || 'undefined'
    // Remove stableFunctions from dependencies to prevent unnecessary re-renders
  ]);

  return (
    <LabTokenContext.Provider value={contextValue}>
      {children}
    </LabTokenContext.Provider>
  );
}

/**
 * Hook to access LAB token context
 * This replaces direct calls to useLabToken in components
 * @returns {Object} LAB token data and functions
 * @throws {Error} If used outside of LabTokenProvider
 */
export function useLabToken() {
  const context = useContext(LabTokenContext);
  
  if (context === null) {
    throw new Error('useLabToken must be used within a LabTokenProvider');
  }
  
  return context;
}

// PropTypes
LabTokenProvider.propTypes = {
  children: PropTypes.node.isRequired
};

export default LabTokenContext;
