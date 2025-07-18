import { useState, useEffect } from 'react';
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { parseUnits, formatUnits } from 'viem';
import { contractAddressesLAB, labTokenABI } from '@/contracts/lab';
import { contractAddresses } from '@/contracts/diamond';
import { selectChain } from '@/utils/selectChain';

/**
 * Hook to handle LAB token operations
 * Includes functions for: balance, approval, transfers, and cost calculation
 */
export function useLabToken() {
  const { address, chain } = useAccount();
  const safeChain = selectChain(chain);
  const labTokenAddress = contractAddressesLAB[safeChain.name.toLowerCase()];
  const diamondContractAddress = contractAddresses[safeChain.name.toLowerCase()];
  
  const { writeContractAsync } = useWriteContract();
  const [lastTxHash, setLastTxHash] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

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

  // Read token decimals
  const { data: decimals } = useReadContract({
    address: labTokenAddress,
    abi: labTokenABI,
    functionName: 'decimals',
    enabled: !!labTokenAddress
  });

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
   * @param {string} labPrice - Laboratory hourly price (in LAB)
   * @param {number} durationMinutes - Duration in minutes
   * @returns {bigint} - Total cost in token wei
   */
  const calculateReservationCost = (labPrice, durationMinutes) => {
    if (!labPrice || !durationMinutes || !decimals) return 0n;
    
    try {
      // Convert hourly price to number
      const pricePerHour = parseFloat(labPrice);
      
      // Calculate proportional price per minute
      const pricePerMinute = pricePerHour / 60;
      
      // Calculate total cost
      const totalCost = pricePerMinute * durationMinutes;
      
      // Convert to wei (considering token decimals)
      return parseUnits(totalCost.toString(), decimals);
    } catch (error) {
      console.error('Error calculating reservation cost:', error);
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
   * Format token amount to a human-readable string
   * @param {bigint} amount - Amount in wei
   * @returns {string} - Formatted amount
   */
  const formatTokenAmount = (amount) => {
    if (!amount || !decimals) return '0';
    return formatUnits(amount, decimals);
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
    formatTokenAmount,
    
    // Functions to refresh
    refetchBalance,
    refetchAllowance
  };
}
