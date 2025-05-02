import { useReadContract, useAccount } from 'wagmi';
import { selectChain } from '../../utils/selectChain';
import { contractAddresses, contractABI } from '../../contracts/diamond';

export default function useDefaultReadContract(contractFunctionName, args = [], hasFetched = false) {
  const { chain: currentChain } = useAccount();
  const safeChain = selectChain(currentChain);

  return useReadContract({
    abi: contractABI,
    address: contractAddresses[safeChain.name.toLowerCase()],
    functionName: contractFunctionName,
    args: args || [],
    chainId: safeChain.id,
    query: {
      enabled: !hasFetched,
      retry: false,
      retryOnMount: false,
      refetchOnReconnect: false,
    },
  });
}