import { useReadContract, useConnection } from 'wagmi'
import { contractAddresses, contractABI } from '@/contracts/diamond'
import { contractAddressesLAB, labTokenABI } from '@/contracts/lab'
import { selectChain } from '@/utils/blockchain/selectChain'
import { normalizeContractAddress } from '@/utils/blockchain/address'

/**
 * Hook for reading from smart contract functions
 * Provides a configured wagmi useReadContract with default settings and error handling
 * @param {string} contractFunctionName - Name of the contract function to call
 * @param {Array} args - Arguments to pass to the contract function
 * @param {Object} [options={}] - Additional query options to override defaults
 * @param {string} [contractType='diamond'] - Type of contract ('diamond' or 'lab')
 * @returns {Object} React Query result with contract read data
 * @returns {any} returns.data - Data returned from the contract function
 * @returns {boolean} returns.isLoading - Whether the query is currently loading
 * @returns {boolean} returns.isError - Whether the query resulted in an error
 * @returns {Error|null} returns.error - Error object if query failed
 * @returns {Function} returns.refetch - Function to manually refetch the data
 */
export default function useDefaultReadContract(contractFunctionName, args = [], options = {}, contractType = 'diamond') {
  const { chain: currentChain } = useConnection();
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
  const normalizedAddress = normalizeContractAddress(address);

  // Validate that all required arguments are defined and not null/undefined
  const hasValidArgs = args.every(arg => arg !== undefined && arg !== null);
  const requestedEnabled = options?.enabled ?? true;
  const hasValidContractConfig = Boolean(normalizedAddress);
  const shouldReportConfigError = Boolean(requestedEnabled && !hasValidContractConfig);
  const configError = shouldReportConfigError
    ? new Error(`Contract address is not configured for chain "${safeChain.name}" (${contractType}).`)
    : null;

  const queryOptions = { ...options };
  delete queryOptions.enabled;

  const result = useReadContract({
    abi,
    address: normalizedAddress || undefined,
    functionName: contractFunctionName,
    args: args || [],
    chainId: safeChain.id,
    query: {
      enabled: Boolean(requestedEnabled && hasValidContractConfig && hasValidArgs),
      retry: 2,
      retryOnMount: true,
      refetchOnReconnect: true,
      ...queryOptions, // Allow overriding defaults
    },
  });

  if (!configError) {
    return result;
  }

  return {
    ...result,
    isError: true,
    isLoading: false,
    isSuccess: false,
    error: configError,
    status: 'error',
  };
}
