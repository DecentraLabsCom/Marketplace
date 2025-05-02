import { useWriteContract, useAccount } from 'wagmi'
import { contractABI, contractAddresses } from '../../contracts/diamond'
import { selectChain } from '../../utils/selectChain'

export default function useAddLab() {
  const { chain: currentChain } = useAccount()
  const safeChain = selectChain(currentChain)
  const address = contractAddresses[safeChain.name.toLowerCase()]
  const { writeContract, ...rest } = useWriteContract()

  function addLab(args) {
    return writeContract({
      address,
      abi: contractABI,
      functionName: 'addLab',
      chainId: safeChain.id,
      args
    })
  }

  return { addLab, ...rest }
}