import { useReadContract, useAccount } from 'wagmi'
import { contractAddresses, contractABI } from '@/contracts/diamond'
import { contractAddressesLAB, labTokenABI } from '@/contracts/lab'
import { selectChain } from '@/utils/blockchain/selectChain'

/**
 * Hook for reading from smart contract functions
 * Provides a configured wagmi useReadContract with default settings and error handling
 * @param {string} contractFunctionName - Name of the contract function to call
 * @param {Array} args - Arguments to pass to the contract function
 * @param {boolean} hasFetched - Whether the data has already been fetched (disables auto-fetch)
 * @param {string} [contractType='diamond'] - Type of contract ('diamond' or 'lab')
 * @returns {Object} React Query result with contract read data
 * @returns {any} returns.data - Data returned from the contract function
 * @returns {boolean} returns.isLoading - Whether the query is currently loading
 * @returns {boolean} returns.isError - Whether the query resulted in an error
 * @returns {Error|null} returns.error - Error object if query failed
 * @returns {Function} returns.refetch - Function to manually refetch the data
 */
export default function useDefaultReadContract(contractFunctionName, args = [], hasFetched = false, contractType = 'diamond') {
  const { chain: currentChain } = useAccount();
  const safeChain = selectChain(currentChain);
  const chainKey = safeChain.name.toLowerCase();

  // Choose contract configuration based on type
  let address, abi;
  if (contractType === 'lab') {
    address = contractAddressesLAB[chainKey];
    abi = labTokenABI;
  } else {
    // Default: diamond contract
    address = contractAddresses[chainKey];
    abi = contractABI;
  }

  return useReadContract({
    abi,
    address,
    functionName: contractFunctionName,
    args: args || [],
    chainId: safeChain.id,
    query: {
      enabled: !hasFetched && !!address,
      retry: 2,
      retryOnMount: true,
      refetchOnReconnect: true,
    },
  });
}
