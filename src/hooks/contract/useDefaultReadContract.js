import { useReadContract, useAccount } from 'wagmi';
import { contractAddresses, contractABI } from '@/contracts/diamond';
import { selectChain } from '@/utils/selectChain';

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
      retry: 2,
      retryOnMount: true,
      refetchOnReconnect: true,
    },
  });
}
