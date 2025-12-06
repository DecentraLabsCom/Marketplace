import { ethers } from 'ethers'
import {
  computeReservationAssertionHash,
  buildReservationIntent,
} from '../signInstitutionalReservationIntent'

describe('signInstitutionalReservationIntent utilities', () => {
  test('computeReservationAssertionHash returns zero hash when assertion is missing', () => {
    expect(computeReservationAssertionHash('')).toBe(ethers.ZeroHash)
    expect(computeReservationAssertionHash(null)).toBe(ethers.ZeroHash)
  })

  test('buildReservationIntent includes the assertion hash', async () => {
    const assertion = 'sso-assertion'
    const hash = computeReservationAssertionHash(assertion)
    const intent = await buildReservationIntent({
      executor: '0x000000000000000000000000000000000000beef',
      signer: '0x000000000000000000000000000000000000beef',
      schacHomeOrganization: 'example.edu',
      puc: 'user-puc',
      labId: 1,
      start: 1,
      end: 2,
      price: 0,
      reservationKey: ethers.solidityPackedKeccak256(['uint256', 'uint32'], [1n, 1n]),
      expiresInSec: 100,
      assertionHash: hash,
      nonce: 1n,
    })

    expect(intent.payload.assertionHash).toBe(hash)
    expect(intent.payload.labId).toBe(1n)
    expect(intent.meta.signer).toBe('0x000000000000000000000000000000000000beef')
    expect(intent.meta.requestedAt).toBeDefined()
  })
})
