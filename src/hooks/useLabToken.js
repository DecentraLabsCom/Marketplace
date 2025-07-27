import { useState, useEffect } from 'react';
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { parseUnits, formatUnits } from 'viem';
import { contractAddressesLAB, labTokenABI } from '@/contracts/lab';
import { contractAddresses } from '@/contracts/diamond';
import { selectChain } from '@/utils/blockchain/selectChain';
import devLog from '@/utils/dev/logger';

// Session storage key for decimals cache
const DECIMALS_CACHE_KEY = 'lab_token_decimals_cache';

/**
 * Utility to get cached decimals or return null
 */
const getCachedDecimals = (chainName) => {
  try {
    const cache = JSON.parse(sessionStorage.getItem(DECIMALS_CACHE_KEY) || '{}');
    return cache[chainName] || null;
  } catch {
    return null;
  }
};

/**
 * Utility to cache decimals for a specific chain
 */
const setCachedDecimals = (chainName, decimals) => {
  try {
    const cache = JSON.parse(sessionStorage.getItem(DECIMALS_CACHE_KEY) || '{}');
    cache[chainName] = decimals;
    sessionStorage.setItem(DECIMALS_CACHE_KEY, JSON.stringify(cache));
  } catch (error) {
    devLog.warn('Failed to cache decimals:', error);
  }
};

/**
 * Clear decimals cache (useful for debugging or network switches)
 */
export const clearDecimalsCache = () => {
  try {
    sessionStorage.removeItem(DECIMALS_CACHE_KEY);
  } catch (error) {
    devLog.warn('Failed to clear decimals cache:', error);
  }
};

/**
 * Hook to handle LAB token operations
 * Includes functions for: balance, approval, transfers, and cost calculation
 */
export function useLabToken() {
  const { address, chain } = useAccount();
  const safeChain = selectChain(chain);
  const chainName = safeChain.name.toLowerCase();
  const labTokenAddress = contractAddressesLAB[chainName];
  const diamondContractAddress = contractAddresses[chainName];
  
  const { writeContractAsync } = useWriteContract();
  const [lastTxHash, setLastTxHash] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [cachedDecimals, setCachedDecimalsState] = useState(() => getCachedDecimals(chainName));

  // Read user balance
  const { data: balance, refetch: refetchBalance } = useReadContract({
    address: labTokenAddress,
    abi: labTokenABI,
    functionName: 'balanceOf',
    args: [address],
    enabled: !!address && !!labTokenAddress
  });

  // Read allowance for diamond contract
  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: labTokenAddress,
    abi: labTokenABI,
    functionName: 'allowance',
    args: [address, diamondContractAddress],
    enabled: !!address && !!labTokenAddress && !!diamondContractAddress
  });

  // Read token decimals only if not cached
  const { data: contractDecimals } = useReadContract({
    address: labTokenAddress,
    abi: labTokenABI,
    functionName: 'decimals',
    enabled: !!labTokenAddress && cachedDecimals === null
  });

  // Update cached decimals when we get them from contract
  useEffect(() => {
    if (contractDecimals !== undefined && cachedDecimals === null) {
      setCachedDecimals(chainName, contractDecimals);
      setCachedDecimalsState(contractDecimals);
    }
  }, [contractDecimals, cachedDecimals, chainName]);

  // Update cached decimals when chain changes
  useEffect(() => {
    const newCachedDecimals = getCachedDecimals(chainName);
    setCachedDecimalsState(newCachedDecimals);
  }, [chainName]);

  // Use cached decimals if available, otherwise fall back to contract data
  const decimals = cachedDecimals !== null ? cachedDecimals : contractDecimals;

  // Wait for transaction confirmation
  const { isLoading: isWaitingForReceipt, isSuccess: isReceiptSuccess } = useWaitForTransactionReceipt({
    hash: lastTxHash,
    enabled: !!lastTxHash
  });

  // Refresh data when transaction is successful
  useEffect(() => {
    if (isReceiptSuccess) {
      refetchBalance();
      refetchAllowance();
      setLastTxHash(null);
      setIsLoading(false);
    }
  }, [isReceiptSuccess, refetchBalance, refetchAllowance]);

  /**
   * Calculate the total cost of a reservation
   * @param {string} labPrice - Laboratory price per second (from cache/backend)
   * @param {number} durationMinutes - Duration in minutes
   * @returns {bigint} - Total cost in token wei
   */
  const calculateReservationCost = (labPrice, durationMinutes) => {
    if (!labPrice || !durationMinutes || !decimals) return 0n;
    
    try {
      // labPrice is already in per-second format from cache/backend
      const pricePerSecond = parseFloat(labPrice);
      
      // Calculate total cost for the duration in seconds
      const durationSeconds = durationMinutes * 60;
      const totalCost = pricePerSecond * durationSeconds;
      
      // Format totalCost to avoid scientific notation for parseUnits
      const totalCostFormatted = totalCost.toFixed(decimals);
      
      // Convert to wei (considering token decimals)
      const costInWei = parseUnits(totalCostFormatted, decimals);
      
      return costInWei;
    } catch (error) {
      devLog.error('Error calculating reservation cost:', error);
      return 0n;
    }
  };

  /**
   * Approve LAB tokens for the diamond contract
   * @param {bigint} amount - Amount to approve in wei
   * @returns {Promise<string>} - Transaction hash
   */
  const approveLabTokens = async (amount) => {
    if (!labTokenAddress || !diamondContractAddress) {
      throw new Error('Contract addresses not available');
    }

    setIsLoading(true);
    try {
      const txHash = await writeContractAsync({
        address: labTokenAddress,
        abi: labTokenABI,
        functionName: 'approve',
        args: [diamondContractAddress, amount],
        chainId: safeChain.id
      });

      setLastTxHash(txHash);
      return txHash;
    } catch (error) {
      setIsLoading(false);
      throw error;
    }
  };

  /**
   * Check if there is sufficient balance and allowance
   * @param {bigint} requiredAmount - Required amount in wei
   * @returns {object} - Balance and allowance status
   */
  const checkBalanceAndAllowance = (requiredAmount) => {
    const userBalance = balance || 0n;
    const currentAllowance = allowance || 0n;
    
    return {
      hasSufficientBalance: userBalance >= requiredAmount,
      hasSufficientAllowance: currentAllowance >= requiredAmount,
      balance: userBalance,
      allowance: currentAllowance,
      requiredAmount
    };
  };

  /**
   * Check if user has sufficient balance for a specific lab booking
   * @param {string} labPrice - Laboratory hourly price (in LAB)
   * @param {number} durationMinutes - Duration in minutes
   * @returns {object} - Balance check result with detailed info
   */
  const checkSufficientBalance = (labPrice, durationMinutes) => {
    const cost = calculateReservationCost(labPrice, durationMinutes);
    const userBalance = balance || 0n;
    
    return {
      hasSufficient: userBalance >= cost,
      cost,
      balance: userBalance,
      shortfall: cost > userBalance ? cost - userBalance : 0n
    };
  };

  /**
   * Format token amount to a human-readable string rounded to 2 decimals
   * @param {bigint} amount - Amount in wei
   * @returns {string} - Formatted amount with 2 decimal places
   */
  const formatTokenAmount = (amount) => {
    if (!amount || !decimals) return '0.00';
    const formatted = parseFloat(formatUnits(amount, decimals));
    const rounded = Math.round(formatted * 100) / 100;
    return rounded.toFixed(2);
  };

  /**
   * Format price from per-second format to per-hour format for UI display
   * @param {string|number|bigint} price - Price per second in decimal format (always from cache/backend)
   * @returns {string} - Human-readable price per hour rounded to 2 decimals
   */
  const formatPrice = (price) => {
    if (!price || price === '0') return '0.00';
    
    try {
      // Backend always provides price in decimal format per second
      const pricePerSecond = parseFloat(price.toString());
      
      if (isNaN(pricePerSecond)) return '0.00';
      
      // Convert from per second to per hour
      const pricePerHour = pricePerSecond * 3600;
      
      // Round to 2 decimal places
      const roundedPrice = Math.round(pricePerHour * 100) / 100;
      
      return roundedPrice.toFixed(2);
      
    } catch (error) {
      devLog.error('Error formatting price:', error, 'Price:', price);
      return '0.00';
    }
  };

  /**
   * Manually refresh balance and allowance data
   * Useful for external components to trigger updates
   */
  const refreshTokenData = () => {
    refetchBalance();
    refetchAllowance();
  };

  return {
    // States
    balance,
    allowance,
    decimals,
    isLoading: isLoading || isWaitingForReceipt,
    labTokenAddress,
    
    // Functions
    calculateReservationCost,
    approveLabTokens,
    checkBalanceAndAllowance,
    checkSufficientBalance,
    formatTokenAmount,
    formatPrice,
    refreshTokenData,
    
    // Functions to refresh
    refetchBalance,
    refetchAllowance,
    
    // Cache utilities
    clearDecimalsCache
  };
}
