import { useState, useEffect, useRef, useCallback } from 'react'
import {
  useConnection,
  useWaitForTransactionReceipt,
  useReadContract,
  useWriteContract,
  usePublicClient
} from 'wagmi'
import { formatUnits } from 'viem'
import useDefaultReadContract from '@/hooks/contract/useDefaultReadContract'
import { contractAddressesLAB, labTokenABI } from '@/contracts/lab'
import { contractAddresses } from '@/contracts/diamond'
import { selectChain } from '@/utils/blockchain/selectChain'
import { getConnectionAddress, isConnectionConnected } from '@/utils/blockchain/connection'
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
const tryParseBigInt = (value) => {
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number' && Number.isFinite(value) && Number.isInteger(value)) {
    return BigInt(value);
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (/^[+-]?\d+$/.test(trimmed)) {
      try {
        return BigInt(trimmed);
      } catch {
        return null;
      }
    }
  }
  return null;
};
const formatFixed2FromScaledInt = (scaledValue) => {
  if (typeof scaledValue !== 'bigint') return '0.00';
  const sign = scaledValue < 0n ? '-' : '';
  const absValue = scaledValue < 0n ? -scaledValue : scaledValue;
  const integerPart = absValue / 100n;
  const fractionalPart = absValue % 100n;
  return `${sign}${integerPart.toString()}.${fractionalPart.toString().padStart(2, '0')}`;
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
 * @returns {Function} returns.approveLabTokensAndWait - Approve tokens and wait for on-chain confirmation
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
  const connection = useConnection();
  const { chain } = connection || {};
  const address = getConnectionAddress(connection);
  const isConnected = isConnectionConnected(connection);
  const safeChain = selectChain(chain);
  const publicClient = usePublicClient({ chainId: safeChain.id });
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
      refetchInterval: shouldFetchAllowance ? 6_000 : false,
      refetchIntervalInBackground: true,
      refetchOnWindowFocus: true,
      refetchOnMount: 'always',
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
    if (!labPrice || !durationMinutes) return 0n;

    try {
      const pricePerSecondUnits = tryParseBigInt(labPrice);
      if (pricePerSecondUnits === null || pricePerSecondUnits < 0n) return 0n;

      const durationSeconds = Number(durationMinutes) * 60;
      if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) return 0n;

      return pricePerSecondUnits * BigInt(Math.floor(durationSeconds));
    } catch (error) {
      devLog.error('Error calculating reservation cost:', error);
      return 0n;
    }
  }, []);

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
   * Approve LAB tokens and wait until the approval transaction is mined.
   * Prevents race conditions where reservation tx is sent before allowance is updated on-chain.
   * @param {bigint} amount - Amount to approve in wei
   * @returns {Promise<string>} - Transaction hash
   */
  const approveLabTokensAndWait = useCallback(async (amount) => {
    const txHash = await approveLabTokens(amount);

    if (!publicClient) {
      throw new Error('Public client not available for approval confirmation');
    }

    const receipt = await publicClient.waitForTransactionReceipt({
      hash: txHash,
      confirmations: 1
    });

    const isTxSuccessful =
      receipt?.status === 'success' ||
      receipt?.status === 1 ||
      receipt?.status === '0x1';

    if (!isTxSuccessful) {
      throw new Error('Approval transaction reverted');
    }

    refetchBalance();
    await refetchAllowance();
    return txHash;
  }, [approveLabTokens, publicClient, refetchBalance, refetchAllowance]);

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
    if (price === null || price === undefined) return '0.00';

    const decimalsValue = Number(decimals);
    if (!Number.isFinite(decimalsValue) || decimalsValue < 0) {
      devLog.warn('formatPrice: invalid decimals, using fallback', decimals);
      return '0.00';
    }

    try {
      const priceUnits = tryParseBigInt(price);
      if (priceUnits !== null) {
        const pricePerHourUnits = priceUnits * 3600n;
        const divisor = 10n ** BigInt(decimalsValue);
        if (divisor === 0n) return '0.00';

        const scaledNumerator = pricePerHourUnits * 100n;
        const quotient = scaledNumerator / divisor;
        const remainder = scaledNumerator % divisor;
        const rounded = remainder * 2n >= divisor ? quotient + 1n : quotient;

        return formatFixed2FromScaledInt(rounded);
      }

      const pricePerSecondUnits = Number(price);
      if (!Number.isFinite(pricePerSecondUnits)) return '0.00';

      const pricePerSecondTokens = pricePerSecondUnits / Math.pow(10, decimalsValue);
      const pricePerHour = pricePerSecondTokens * 3600;
      const roundedPrice = Math.round((pricePerHour + Number.EPSILON) * 100) / 100;

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
    approveLabTokensAndWait,
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
