import { useWriteContract, useAccount } from 'wagmi'
import { contractABI, contractAddresses } from '../../contracts/diamond'
import { selectChain } from '../../utils/selectChain'

export default function useDeleteLab() {
  const { chain: currentChain } = useAccount()
  const safeChain = selectChain(currentChain)
  const address = contractAddresses[safeChain.name.toLowerCase()]
  const { writeContract, ...rest } = useWriteContract()

  function deleteLab(args) {
    return writeContract({
      address,
      abi: contractABI,
      functionName: 'deleteLab', // Asegúrate de que el nombre coincide con tu contrato
      chainId: safeChain.id,
      args
    })
  }

  return { deleteLab, ...rest }
}