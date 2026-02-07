import createPendingBookingPayload from '../utils/createPendingBookingPayload'

describe('createPendingBookingPayload', () => {
  test('builds wallet pending payload with normalized calendar fields', () => {
    const payload = createPendingBookingPayload({
      reservationKey: 'opt-1',
      tokenId: '10',
      userAddress: '0xabc',
      start: 1735689600,
      end: 1735693200,
      status: 'pending',
      transactionHash: '0xhash',
      isOptimistic: true,
      isProcessing: false,
      extra: { source: 'wallet' },
    })

    expect(payload).toEqual(
      expect.objectContaining({
        id: 'opt-1',
        reservationKey: 'opt-1',
        tokenId: '10',
        labId: '10',
        userAddress: '0xabc',
        start: '1735689600',
        end: '1735693200',
        startTime: 1735689600,
        endTime: 1735693200,
        status: 'pending',
        statusCategory: 'pending',
        isPending: true,
        isOptimistic: true,
        isProcessing: false,
        transactionHash: '0xhash',
        source: 'wallet',
      })
    )
    expect(typeof payload.date).toBe('string')
    expect(typeof payload.timestamp).toBe('string')
  })

  test('builds SSO requested payload with intent metadata', () => {
    const payload = createPendingBookingPayload({
      reservationKey: 'rk-1',
      tokenId: '22',
      userAddress: '0xsso',
      start: 1735689600,
      end: 1735691400,
      status: 'requested',
      intentRequestId: 'req-1',
      intentStatus: 'requested',
      note: 'Requested to institution',
      isOptimistic: true,
    })

    expect(payload).toEqual(
      expect.objectContaining({
        id: 'rk-1',
        reservationKey: 'rk-1',
        tokenId: '22',
        labId: '22',
        status: 'requested',
        intentRequestId: 'req-1',
        intentStatus: 'requested',
        note: 'Requested to institution',
        isPending: true,
        isOptimistic: true,
      })
    )
  })

  test('accepts numeric status and normalizes to semantic pending', () => {
    const payload = createPendingBookingPayload({
      tokenId: '33',
      start: 1735689600,
      end: 1735691400,
      status: 0,
    })

    expect(payload.status).toBe('pending')
  })

  test('normalizes bigint fields to strings where needed', () => {
    const payload = createPendingBookingPayload({
      reservationKey: 123n,
      tokenId: 77n,
      start: 1735689600n,
      end: 1735693200n,
      transactionHash: 999n,
      intentRequestId: 456n,
    })

    expect(payload).toEqual(
      expect.objectContaining({
        id: '123',
        reservationKey: '123',
        tokenId: '77',
        labId: '77',
        start: '1735689600',
        end: '1735693200',
        transactionHash: '999',
        intentRequestId: '456',
      })
    )
    expect(payload.startTime).toBe(1735689600)
    expect(payload.endTime).toBe(1735693200)
  })

  test('supports deterministic now and idFactory', () => {
    const fixedNow = new Date('2026-02-07T12:00:00.000Z')
    const payload = createPendingBookingPayload({
      tokenId: '44',
      start: 1735689600,
      end: 1735691400,
      now: fixedNow,
      idFactory: () => 'fixed-id',
    })

    expect(payload.id).toBe('fixed-id')
    expect(payload.reservationKey).toBe('fixed-id')
    expect(payload.timestamp).toBe('2026-02-07T12:00:00.000Z')
  })
})
