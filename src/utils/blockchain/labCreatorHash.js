import { Interface } from 'ethers'

export const ZERO_BYTES32 = `0x${'0'.repeat(64)}`

const LAB_CREATOR_HASH_INTERFACE = new Interface([
  'function getPucHash(uint256 labId) view returns (bytes32)',
])

export async function readLabPucHash(contract, labId) {
  if (!contract?.runner?.call) {
    throw new Error('Contract runner does not support read calls')
  }

  const target =
    typeof contract.getAddress === 'function'
      ? await contract.getAddress()
      : contract.target

  const data = LAB_CREATOR_HASH_INTERFACE.encodeFunctionData('getPucHash', [BigInt(labId)])
  const raw = await contract.runner.call({ to: target, data })
  const [pucHash] = LAB_CREATOR_HASH_INTERFACE.decodeFunctionResult('getPucHash', raw)
  return String(pucHash)
}
