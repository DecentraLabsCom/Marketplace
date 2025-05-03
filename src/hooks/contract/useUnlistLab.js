import { useWriteContract, useAccount } from 'wagmi'
import { contractABI, contractAddresses } from '../../contracts/diamond'
import { selectChain } from '../../utils/selectChain'

export default function useUnlistLab() {
  const { chain: currentChain } = useAccount()
  const safeChain = selectChain(currentChain)
  const address = contractAddresses[safeChain.name.toLowerCase()]
  const { writeContract, ...rest } = useWriteContract()

  function unlistLab(args) {
    return writeContract({
      address,
      abi: contractABI,
      functionName: 'unlistLab', // Asegúrate de que el nombre coincide con tu contrato
      chainId: safeChain.id,
      args
    })
  }

  return { unlistLab, ...rest }
}