import { useWriteContract, useAccount } from 'wagmi'
import PropTypes from 'prop-types'
import { contractABI, contractAddresses } from '@/contracts/diamond'
import { selectChain } from '@/utils/blockchain/selectChain'
import devLog from '@/utils/dev/logger'

/**
 * Hook for writing to smart contract functions
 * Provides a unified interface for writing to blockchain contract methods with error handling
 * @param {string} functionName - Name of the contract function to call
 * @returns {Object} Object containing contractWriteFunction and wagmi utilities
 * @returns {Function} returns.contractWriteFunction - Async function to execute contract writes
 * @returns {Object} returns.writeContractAsync - Original wagmi write function
 * @returns {boolean} returns.isPending - Whether a write operation is pending
 * @returns {Error|null} returns.error - Last error from write operation
 * @throws {Error} When wallet is not connected or contract address not found
 */
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

useContractWriteFunction.propTypes = {
  functionName: PropTypes.string.isRequired
}
