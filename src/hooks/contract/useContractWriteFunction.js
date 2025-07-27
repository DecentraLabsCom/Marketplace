import { useWriteContract, useAccount } from 'wagmi'
import { contractABI, contractAddresses } from '@/contracts/diamond'
import { selectChain } from '@/utils/blockchain/selectChain'
import devLog from '@/utils/dev/logger'

export default function useContractWriteFunction(functionName) {
  const { chain, address: userAddress, isConnected } = useAccount()
  const safeChain = selectChain(chain)
  const contractAddress = contractAddresses[safeChain.name.toLowerCase()]
  const { writeContractAsync, ...rest } = useWriteContract()

  async function contractWriteFunction(args, options = {}) {
    devLog.log('Contract write function called with:', {
      functionName,
      args,
      contractAddress,
      safeChain: safeChain.name,
      chainId: safeChain.id,
      userAddress,
      isConnected,
      options
    })

    if (!isConnected) {
      throw new Error('Wallet not connected')
    }

    if (!contractAddress) {
      throw new Error(`Contract address not found for chain: ${safeChain.name}`)
    }

    const contractCall = {
      address: contractAddress,
      abi: contractABI,
      functionName: functionName,
      chainId: safeChain.id,
      args,
      ...options // This allows passing gas, value, etc.
    }

    const result = await writeContractAsync(contractCall)

    devLog.log('Contract write result:', result)
    return result
  }

  return { contractWriteFunction, ...rest }
}
