import { ethers } from 'ethers'
import {
  computeAssertionHash,
  hashActionPayload,
  buildActionIntent,
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
      assertionHash: hash,
      labId: 10,
      nonce: 1n,
      expiresInSec: 300,
    })

    expect(intent.payload.assertionHash).toBe(hash)
    expect(intent.meta.signer).toBe('0x000000000000000000000000000000000000dead')
    expect(intent.payload.labId).toBe(10n)
    expect(intent.payload.maxBatch).toBe(0n)
  })

  test('hashActionPayload matches Solidity ABI encoding for FMU update payloads', () => {
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
        '0x000000000000000000000000000000000000dEaD',
        ethers.keccak256(ethers.toUtf8Bytes('uned.es')),
        `0x${'12'.repeat(32)}`,
        ethers.ZeroHash,
        2n,
        ethers.ZeroHash,
        ethers.keccak256(ethers.toUtf8Bytes('https://blob.example.com/data/Lab-UNED-2.json')),
        9n,
        0n,
        ethers.keccak256(ethers.toUtf8Bytes('https://sarlab.dia.uned.es')),
        ethers.keccak256(ethers.toUtf8Bytes('BouncingBall.fmu')),
        ethers.keccak256(ethers.toUtf8Bytes('')),
        1n,
      ],
    ))

    expect(hashActionPayload({
      executor: '0x000000000000000000000000000000000000dEaD',
      schacHomeOrganization: 'uned.es',
      pucHash: `0x${'12'.repeat(32)}`,
      assertionHash: ethers.ZeroHash,
      labId: 2,
      reservationKey: ethers.ZeroHash,
      uri: 'https://blob.example.com/data/Lab-UNED-2.json',
      price: 9,
      maxBatch: 0,
      accessURI: 'https://sarlab.dia.uned.es',
      accessKey: 'BouncingBall.fmu',
      tokenURI: '',
      resourceType: 'fmu',
    })).toBe(expected)
  })

})
