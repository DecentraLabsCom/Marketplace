import { useState, useEffect, useRef, useCallback } from 'react'
import { useAccount, useWaitForTransactionReceipt, useReadContract, useWriteContract } from 'wagmi'
import { formatUnits } from 'viem'
import useDefaultReadContract from '@/hooks/contract/useDefaultReadContract'
import { contractAddressesLAB, labTokenABI } from '@/contracts/lab'
import { contractAddresses } from '@/contracts/diamond'
import { selectChain } from '@/utils/blockchain/selectChain'
import devLog from '@/utils/dev/logger'

// Session storage key for decimals cache
const DECIMALS_CACHE_KEY = 'lab_token_decimals_cache';
// Safe fallback when on-chain decimals cannot be resolved
const DEFAULT_LAB_TOKEN_DECIMALS = 6;

/**
 * Utility to get cached decimals or return null
 */
const getCachedDecimals = (chainName, tokenAddress) => {
  try {
    const cache = JSON.parse(sessionStorage.getItem(DECIMALS_CACHE_KEY) || '{}');
    const normalizedToken = typeof tokenAddress === 'string' ? tokenAddress.toLowerCase() : null;
    if (normalizedToken) {
      const tokenKey = `${chainName}:${normalizedToken}`;
      if (cache[tokenKey] !== undefined) {
        return cache[tokenKey];
      }
    }
    return cache[chainName] || null;
  } catch {
    return null;
  }
};

/**
 * Utility to cache decimals for a specific chain
 */
const setCachedDecimals = (chainName, tokenAddress, decimals) => {
  try {
    const cache = JSON.parse(sessionStorage.getItem(DECIMALS_CACHE_KEY) || '{}');
    const normalizedToken = typeof tokenAddress === 'string' ? tokenAddress.toLowerCase() : null;
    if (normalizedToken) {
      cache[`${chainName}:${normalizedToken}`] = decimals;
    } else {
      cache[chainName] = decimals;
    }
    sessionStorage.setItem(DECIMALS_CACHE_KEY, JSON.stringify(cache));
  } catch (error) {
    devLog.warn('Failed to cache decimals:', error);
  }
};

const isValidAddress = (addr) => typeof addr === 'string' && /^0x[a-fA-F0-9]{40}$/.test(addr);
const isZeroAddress = (addr) => typeof addr === 'string' && /^0x0{40}$/.test(addr);
const normalizeAddress = (addr) => {
  if (typeof addr !== 'string') return undefined;
  const trimmed = addr.trim();
  const unquoted = trimmed.replace(/^['"]|['"]$/g, '');
  return isValidAddress(unquoted) && !isZeroAddress(unquoted) ? unquoted : undefined;
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
 * NOTE: This should only be used inside LabTokenContext. 
 * Components should use the context version instead.
 * 
 * @returns {Object} Lab token utilities and state
 * @returns {bigint} returns.balance - User's LAB token balance in wei
 * @returns {bigint} returns.allowance - Approved amount for diamond contract in wei
 * @returns {number} returns.decimals - Token decimals (cached across sessions)
 * @returns {boolean} returns.isLoading - Whether any operation is loading
 * @returns {string} returns.labTokenAddress - LAB token contract address
 * @returns {Function} returns.calculateReservationCost - Calculate booking cost function
 * @returns {Function} returns.approveLabTokens - Approve tokens for spending function
 * @returns {Function} returns.checkBalanceAndAllowance - Check balances function
 * @returns {Function} returns.checkSufficientBalance - Check sufficient balance function
 * @returns {Function} returns.formatTokenAmount - Format amount to readable string function
 * @returns {Function} returns.formatPrice - Format price per hour function
 * @returns {Function} returns.refreshTokenData - Manually refresh data function
 * @returns {Function} returns.refetchBalance - Refetch balance function
 * @returns {Function} returns.refetchAllowance - Refetch allowance function
 * @returns {Function} returns.clearDecimalsCache - Clear cached decimals function
 */
export function useLabTokenHook() {
  const { address, chain, isConnected } = useAccount();
  const safeChain = selectChain(chain);
  const chainName = safeChain.name.toLowerCase();
  const envLabTokenAddress = contractAddressesLAB[chainName];
  const diamondContractAddress = contractAddresses[chainName];
  const normalizedLabTokenAddress = normalizeAddress(envLabTokenAddress);

  // Prefer on-chain token address when available (avoids env mismatch)
  const { data: onChainLabTokenAddress } = useDefaultReadContract(
    'getLabTokenAddress',
    [],
    { enabled: Boolean(diamondContractAddress) }
  );
  const resolvedLabTokenAddress = normalizeAddress(onChainLabTokenAddress) || normalizedLabTokenAddress;
  const shouldFetchBalance = Boolean(address && resolvedLabTokenAddress);

  useEffect(() => {
    const normalizedOnChain = normalizeAddress(onChainLabTokenAddress);
    if (
      normalizedOnChain &&
      normalizedLabTokenAddress &&
      normalizedOnChain.toLowerCase() !== normalizedLabTokenAddress.toLowerCase()
    ) {
      devLog.warn('LAB token address mismatch (on-chain vs env)', {
        onChain: normalizedOnChain,
        env: normalizedLabTokenAddress,
      });
    }
  }, [onChainLabTokenAddress, normalizedLabTokenAddress]);
  
  const [lastTxHash, setLastTxHash] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [cachedDecimals, setCachedDecimalsState] = useState(() =>
    getCachedDecimals(chainName, resolvedLabTokenAddress || normalizedLabTokenAddress)
  );
  const [fallbackDecimals, setFallbackDecimals] = useState(null);
  const fallbackFetchInFlight = useRef(false);

  // Read user token balance directly from ERC20 contract to avoid native token fallbacks
  const { data: balance, refetch: refetchBalance } = useReadContract({
    abi: labTokenABI,
    address: resolvedLabTokenAddress,
    functionName: 'balanceOf',
    args: [address],
    chainId: safeChain.id,
    query: {
      enabled: shouldFetchBalance,
      gcTime: 0,
      staleTime: 0,
      refetchInterval: shouldFetchBalance ? 6_000 : false,
      refetchIntervalInBackground: true,
      refetchOnReconnect: true,
      refetchOnWindowFocus: true,
      refetchOnMount: 'always',
    },
  });

  // Read allowance for diamond contract from resolved LAB token address
  const shouldFetchAllowance = Boolean(address && resolvedLabTokenAddress && diamondContractAddress);
  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    abi: labTokenABI,
    address: resolvedLabTokenAddress,
    functionName: 'allowance',
    args: [address, diamondContractAddress],
    chainId: safeChain.id,
    query: {
      enabled: shouldFetchAllowance,
      retry: 2,
      retryOnMount: true,
      refetchOnReconnect: true,
    },
  });

  const previousShouldFetchRef = useRef(shouldFetchBalance);

  useEffect(() => {
    if (shouldFetchBalance && !previousShouldFetchRef.current) {
      devLog.log('🔁 Balance tracking re-enabled. Forcing immediate refetch.');
      refetchBalance();
      refetchAllowance();
    }
    previousShouldFetchRef.current = shouldFetchBalance;
  }, [shouldFetchBalance, refetchBalance, refetchAllowance]);

  // Read token decimals only if not cached
  const { data: contractDecimals } = useReadContract({
    abi: labTokenABI,
    address: resolvedLabTokenAddress,
    functionName: 'decimals',
    chainId: safeChain.id,
    query: {
      enabled: Boolean(resolvedLabTokenAddress) && cachedDecimals === null,
      retry: 2,
      retryOnMount: true,
      refetchOnReconnect: true,
    },
  });

  // Get the write function for LAB token contract (resolved address)
  const { writeContractAsync: writeLabToken } = useWriteContract();

  // Update cached decimals when we get them from contract
  useEffect(() => {
    if (contractDecimals !== undefined && cachedDecimals === null) {
      setCachedDecimals(chainName, resolvedLabTokenAddress, contractDecimals);
      setCachedDecimalsState(contractDecimals);
    }
  }, [contractDecimals, cachedDecimals, chainName, resolvedLabTokenAddress]);

  // Update cached decimals when chain or token changes
  useEffect(() => {
    const newCachedDecimals = getCachedDecimals(chainName, resolvedLabTokenAddress || normalizedLabTokenAddress);
    setCachedDecimalsState(newCachedDecimals);
    setFallbackDecimals(null);
    fallbackFetchInFlight.current = false;
  }, [chainName, resolvedLabTokenAddress, normalizedLabTokenAddress]);

  // Fetch decimals via API as a fallback when on-chain read isn't available yet
  useEffect(() => {
    const hasCached = cachedDecimals !== null && cachedDecimals !== undefined;
    const hasContract = contractDecimals !== undefined && contractDecimals !== null;
    const hasFallback = fallbackDecimals !== null && fallbackDecimals !== undefined;

    if (hasCached || hasContract || hasFallback || fallbackFetchInFlight.current) return;

    let isCancelled = false;
    fallbackFetchInFlight.current = true;

    (async () => {
      try {
        const response = await fetch('/api/contract/erc20/decimals', {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
          cache: 'no-store',
        });

        if (!response.ok) {
          throw new Error(`Failed to fetch token decimals: ${response.status}`);
        }

        const data = await response.json();
        const apiDecimals = Number(data?.decimals);
        const resolved = Number.isFinite(apiDecimals) ? apiDecimals : DEFAULT_LAB_TOKEN_DECIMALS;
        const isFallback = Boolean(data?.fallback) || !Number.isFinite(apiDecimals);

        if (!isCancelled) {
          setFallbackDecimals(resolved);
          if (!isFallback) {
            setCachedDecimals(chainName, resolvedLabTokenAddress, resolved);
            setCachedDecimalsState(resolved);
          }
        }
      } catch (error) {
        devLog.warn('Failed to fetch LAB token decimals fallback:', error);
        if (!isCancelled) {
          setFallbackDecimals(DEFAULT_LAB_TOKEN_DECIMALS);
        }
      } finally {
        fallbackFetchInFlight.current = false;
      }
    })();

    return () => {
      isCancelled = true;
    };
  }, [cachedDecimals, contractDecimals, fallbackDecimals, chainName, resolvedLabTokenAddress]);

  // Force refetch balance and allowance when wallet address changes
  // This ensures fresh data when user switches wallets in MetaMask
  useEffect(() => {
    if (address && shouldFetchBalance) {
      devLog.log('🔄 Wallet or chain changed, refetching balance and allowance:', {
        address,
        chainId: safeChain.id
      });

      // Small delay to ensure Wagmi has updated its internal query cache with new address/chain
      const timeoutId = setTimeout(() => {
        refetchBalance();
        refetchAllowance();
      }, 120);
      
      return () => clearTimeout(timeoutId);
    }
  }, [address, safeChain.id, shouldFetchBalance, refetchBalance, refetchAllowance]);

  // Use cached decimals if available, otherwise fall back to contract data, API fallback, or default
  const decimals =
    cachedDecimals !== null && cachedDecimals !== undefined
      ? cachedDecimals
      : contractDecimals !== undefined && contractDecimals !== null
        ? contractDecimals
        : fallbackDecimals !== null && fallbackDecimals !== undefined
          ? fallbackDecimals
          : DEFAULT_LAB_TOKEN_DECIMALS;

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
   * Memoized to prevent unnecessary re-renders in consuming components
   * @param {string} labPrice - Laboratory price per second in contract units (smallest denomination)
   * @param {number} durationMinutes - Duration in minutes
   * @returns {bigint} - Total cost in token wei
   */
  const calculateReservationCost = useCallback((labPrice, durationMinutes) => {
    if (!labPrice || !durationMinutes || !decimals) return 0n;
    
    try {
      // Contract provides price in smallest units per second
      const pricePerSecondUnits = parseFloat(labPrice.toString());
      
      if (isNaN(pricePerSecondUnits)) return 0n;
      
      // Calculate total cost for the duration in seconds (still in contract units)
      const durationSeconds = durationMinutes * 60;
      const totalCostUnits = pricePerSecondUnits * durationSeconds;
      
      // totalCostUnits is already in the smallest token units (wei)
      // Convert to bigint for return
      const costInWei = BigInt(Math.floor(totalCostUnits));
      
      return costInWei;
    } catch (error) {
      devLog.error('Error calculating reservation cost:', error);
      return 0n;
    }
  }, [decimals]);

  /**
   * Approve LAB tokens for the diamond contract
   * Memoized to prevent unnecessary re-renders in consuming components
   * @param {bigint} amount - Amount to approve in wei
   * @returns {Promise<string>} - Transaction hash
   */
  const approveLabTokens = useCallback(async (amount) => {
    if (!isConnected) {
      throw new Error('Wallet not connected');
    }

    if (!resolvedLabTokenAddress || !diamondContractAddress) {
      throw new Error('Contract addresses not available');
    }

    setIsLoading(true);
    try {
      const txHash = await writeLabToken({
        address: resolvedLabTokenAddress,
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
  }, [resolvedLabTokenAddress, diamondContractAddress, writeLabToken, safeChain.id, isConnected]);

  /**
   * Check if there is sufficient balance and allowance
   * Memoized to prevent unnecessary re-renders in consuming components
   * @param {bigint} requiredAmount - Required amount in wei
   * @returns {object} - Balance and allowance status
   */
  const checkBalanceAndAllowance = useCallback((requiredAmount) => {
    const userBalance = balance || 0n;
    const currentAllowance = allowance || 0n;
    
    return {
      hasSufficientBalance: userBalance >= requiredAmount,
      hasSufficientAllowance: currentAllowance >= requiredAmount,
      balance: userBalance,
      allowance: currentAllowance,
      requiredAmount
    };
  }, [balance, allowance]);

  /**
   * Check if user has sufficient balance for a specific lab booking
   * Memoized to prevent unnecessary re-renders in consuming components
   * @param {string} labPrice - Laboratory hourly price (in LAB)
   * @param {number} durationMinutes - Duration in minutes
   * @returns {object} - Balance check result with detailed info
   */
  const checkSufficientBalance = useCallback((labPrice, durationMinutes) => {
    const cost = calculateReservationCost(labPrice, durationMinutes);
    const userBalance = balance || 0n;
    
    return {
      hasSufficient: userBalance >= cost,
      cost,
      balance: userBalance,
      shortfall: cost > userBalance ? cost - userBalance : 0n
    };
  }, [calculateReservationCost, balance]);

  /**
   * Format token amount to a human-readable string rounded to 2 decimals
   * Memoized to prevent unnecessary re-renders in consuming components
   * @param {bigint} amount - Amount in wei
   * @returns {string} - Formatted amount with 2 decimal places
   */
  const formatTokenAmount = useCallback((amount) => {
    if (!amount || !decimals) return '0.00';
    const formatted = parseFloat(formatUnits(amount, decimals));
    const rounded = Math.round(formatted * 100) / 100;
    return rounded.toFixed(2);
  }, [decimals]);

  /**
   * Format price from contract units to per-hour format for UI display
   * Memoized to prevent unnecessary re-renders in consuming components
   * @param {string|number|bigint} price - Price per second in contract units (smallest denomination)
   * @returns {string} - Human-readable price per hour rounded to 2 decimals
   */
  const formatPrice = useCallback((price) => {
    if (!price || price === '0') return '0.00';
    
    // If decimals not loaded yet, return placeholder
    if (decimals === undefined || decimals === null) {
      devLog.warn('formatPrice: decimals not loaded yet, using fallback');
      return '0.00';
    }
    
    try {
      // Contract provides price in smallest units per second
      const pricePerSecondUnits = parseFloat(price.toString());
      
      if (isNaN(pricePerSecondUnits)) return '0.00';
      
      // Convert from contract units to decimal tokens (divide by 10^decimals)
      const pricePerSecondTokens = pricePerSecondUnits / Math.pow(10, decimals);
      
      // Convert from per second to per hour
      const pricePerHour = pricePerSecondTokens * 3600;
      
      // Round to 2 decimal places
      const roundedPrice = Math.round(pricePerHour * 100) / 100;
      
      return roundedPrice.toFixed(2);
      
    } catch (error) {
      devLog.error('Error formatting price:', error, 'Price:', price, 'Decimals:', decimals);
      return '0.00';
    }
  }, [decimals]);

  /**
   * Manually refresh balance and allowance data
   * Useful for external components to trigger updates
   * Memoized to prevent unnecessary re-renders in consuming components
   */
  const refreshTokenData = useCallback(() => {
    refetchBalance();
    refetchAllowance();
  }, [refetchBalance, refetchAllowance]);

  return {
    // States
    balance,
    allowance,
    decimals,
    isLoading: isLoading || isWaitingForReceipt,
    labTokenAddress: resolvedLabTokenAddress,
    
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
