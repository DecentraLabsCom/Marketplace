import { ethers } from 'ethers'
import {
  computeAssertionHash,
  buildActionIntent,
  hashActionPayload,
  ACTION_CODES,
} from '../signInstitutionalActionIntent'

describe('signInstitutionalActionIntent utilities', () => {
  test('computeAssertionHash returns zero hash for empty assertions', () => {
    expect(computeAssertionHash('')).toBe(ethers.ZeroHash)
    expect(computeAssertionHash(null)).toBe(ethers.ZeroHash)
    expect(computeAssertionHash(undefined)).toBe(ethers.ZeroHash)
  })

  test('computeAssertionHash returns keccak256 of the UTF-8 bytes', () => {
    const assertion = '<Assertion>payload</Assertion>'
    const expected = ethers.keccak256(ethers.toUtf8Bytes(assertion))
    expect(computeAssertionHash(assertion)).toBe(expected)
  })

  test('buildActionIntent propagates the provided assertionHash', async () => {
    const assertion = 'saml-data'
    const hash = computeAssertionHash(assertion)
    const intent = await buildActionIntent({
      action: ACTION_CODES.LAB_LIST,
      executor: '0x000000000000000000000000000000000000dead',
      signer: '0x000000000000000000000000000000000000dead',
      schacHomeOrganization: 'example.edu',
      pucHash: `0x${'34'.repeat(32)}`,
      assertionHash: hash,
      labId: 10,
      nonce: 1n,
      expiresInSec: 300,
    })

    expect(intent.payload.assertionHash).toBe(hash)
    expect(intent.payload.pucHash).toBe(`0x${'34'.repeat(32)}`)
    expect(intent.meta.signer).toBe('0x000000000000000000000000000000000000dead')
    expect(intent.payload.labId).toBe(10n)
    expect(intent.payload.maxBatch).toBe(0n)
  })

  test('hashActionPayload matches current action payload ABI with pucHash bytes32', () => {
    const payload = {
      executor: '0x000000000000000000000000000000000000dEaD',
      schacHomeOrganization: 'uned.es',
      pucHash: `0x${'34'.repeat(32)}`,
      assertionHash: `0x${'12'.repeat(32)}`,
      labId: 2,
      reservationKey: ethers.ZeroHash,
      uri: 'https://blob.example.com/data/Lab-UNED-2.json',
      price: 7,
      maxBatch: 0,
      accessURI: 'https://sarlab.dia.uned.es',
      accessKey: 'BouncingBall.fmu',
      tokenURI: '',
      resourceType: 1,
    }
    const typeHash = ethers.keccak256(ethers.toUtf8Bytes(
      'ActionIntentPayload(address executor,string schacHomeOrganization,bytes32 pucHash,bytes32 assertionHash,uint256 labId,bytes32 reservationKey,string uri,uint96 price,uint96 maxBatch,string accessURI,string accessKey,string tokenURI,uint8 resourceType)'
    ))
    const expected = ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(
      [
        'bytes32',
        'address',
        'bytes32',
        'bytes32',
        'bytes32',
        'uint256',
        'bytes32',
        'bytes32',
        'uint96',
        'uint96',
        'bytes32',
        'bytes32',
        'bytes32',
        'uint8',
      ],
      [
        typeHash,
        payload.executor,
        ethers.keccak256(ethers.toUtf8Bytes(payload.schacHomeOrganization)),
        payload.pucHash,
        payload.assertionHash,
        BigInt(payload.labId),
        payload.reservationKey,
        ethers.keccak256(ethers.toUtf8Bytes(payload.uri)),
        BigInt(payload.price),
        BigInt(payload.maxBatch),
        ethers.keccak256(ethers.toUtf8Bytes(payload.accessURI)),
        ethers.keccak256(ethers.toUtf8Bytes(payload.accessKey)),
        ethers.keccak256(ethers.toUtf8Bytes(payload.tokenURI)),
        BigInt(payload.resourceType),
      ],
    ))

    expect(hashActionPayload(payload)).toBe(expected)
  })

})
