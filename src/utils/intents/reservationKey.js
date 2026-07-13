import { ethers } from 'ethers'

export function computeIntentReservationKey({
  labId,
  start,
  resourceType = 0,
  institutionAddress,
  pucHash,
  requestId,
}) {
  if (BigInt(resourceType ?? 0) !== 1n) {
    return ethers.solidityPackedKeccak256(['uint256', 'uint32'], [BigInt(labId), BigInt(start)])
  }
  if (!ethers.isAddress(institutionAddress)) {
    throw new Error('A valid institution address is required for an FMU reservation key')
  }
  if (!ethers.isHexString(pucHash, 32) || pucHash === ethers.ZeroHash) {
    throw new Error('A non-zero PUC hash is required for an FMU reservation key')
  }
  if (!ethers.isHexString(requestId, 32) || requestId === ethers.ZeroHash) {
    throw new Error('A non-zero requestId is required for an FMU reservation key')
  }
  return ethers.solidityPackedKeccak256(
    ['uint256', 'uint32', 'address', 'bytes32', 'bytes32'],
    [BigInt(labId), BigInt(start), institutionAddress, pucHash, requestId],
  )
}
