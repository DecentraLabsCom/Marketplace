import { useWriteContract, useAccount } from 'wagmi'
import { contractABI, contractAddresses } from '../../contracts/diamond'
import { selectChain } from '../../utils/selectChain'

export default function useContractWriteFunction(functionName) {
  const { chain } = useAccount()
  const safeChain = selectChain(chain)
  const address = contractAddresses[safeChain.name.toLowerCase()]
  const { writeContractAsync, ...rest } = useWriteContract()

  async function contractWriteFunction(args) {
    return writeContractAsync({
      address,
      abi: contractABI,
      functionName: functionName,
      chainId: safeChain.id,
      args
    })
  }

  return { contractWriteFunction, ...rest }
}