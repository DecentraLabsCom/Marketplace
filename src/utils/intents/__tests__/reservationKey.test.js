import { ethers } from 'ethers'
import { computeIntentReservationKey } from '../reservationKey'

describe('computeIntentReservationKey', () => {
  const common = {
    labId: 12n,
    start: 1_800_000_000n,
    institutionAddress: '0x1111111111111111111111111111111111111111',
    pucHash: `0x${'22'.repeat(32)}`,
  }

  test('preserves the physical-lab slot key', () => {
    expect(computeIntentReservationKey({ ...common, resourceType: 0, requestId: `0x${'33'.repeat(32)}` }))
      .toBe(ethers.solidityPackedKeccak256(['uint256', 'uint32'], [12n, 1_800_000_000n]))
  })

  test('gives simultaneous FMU requests independent identities', () => {
    const first = computeIntentReservationKey({ ...common, resourceType: 1, requestId: `0x${'33'.repeat(32)}` })
    const second = computeIntentReservationKey({ ...common, resourceType: 1, requestId: `0x${'44'.repeat(32)}` })

    expect(first).not.toBe(second)
  })
})
