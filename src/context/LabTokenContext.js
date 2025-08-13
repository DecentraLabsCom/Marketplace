"use client";
import React, { createContext, useContext, useMemo, useRef } from 'react';
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
  
  // Use refs to maintain stable function references
  const functionsRef = useRef({
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
  });
  
  // Update function refs when labTokenData changes
  functionsRef.current = {
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
  };
  
  // Memoize the context value to prevent unnecessary re-renders
  // Only depend on values that should trigger context updates
  const contextValue = useMemo(() => {
    // Only log when there's meaningful data or important state changes
    const hasData = labTokenData.balance || labTokenData.decimals;
    if (hasData && process.env.NODE_ENV === 'development') {
      devLog.log('LabTokenContext: Context value updated', {
        balance: labTokenData.balance?.toString(),
        decimals: labTokenData.decimals,
        isLoading: labTokenData.isLoading
      });
    }

    return {
      // Token state - these values changing should trigger updates
      balance: labTokenData.balance,
      allowance: labTokenData.allowance,
      decimals: labTokenData.decimals,
      isLoading: labTokenData.isLoading,
      labTokenAddress: labTokenData.labTokenAddress,
      
      // Token functions - use stable references
      ...functionsRef.current
    };
  }, [
    labTokenData.balance,
    labTokenData.allowance,
    labTokenData.decimals,
    labTokenData.isLoading,
    labTokenData.labTokenAddress
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
