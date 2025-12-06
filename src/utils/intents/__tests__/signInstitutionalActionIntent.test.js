import { ethers } from 'ethers'
import {
  computeAssertionHash,
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

  test('ACTION_CODES includes institutional cancels', () => {
    expect(ACTION_CODES.CANCEL_INSTITUTIONAL_REQUEST_BOOKING).toBe(12)
    expect(ACTION_CODES.CANCEL_INSTITUTIONAL_BOOKING).toBe(13)
  })
})
