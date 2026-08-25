import { serializeIntent } from '../serialize'

describe('serializeIntent', () => {
  test('serializes bigint values recursively without changing the intent shape', () => {
    const intent = {
      meta: {
        nonce: 7n,
        requestedAt: 1_700_000_000n,
        expiresAt: 1_700_000_900n,
      },
      payload: {
        labId: 42n,
        window: [10n, 20n],
      },
    }

    expect(serializeIntent(intent)).toEqual({
      meta: {
        nonce: '7',
        requestedAt: '1700000000',
        expiresAt: '1700000900',
      },
      payload: {
        labId: '42',
        window: ['10', '20'],
      },
    })
  })

  test('keeps null values and omits undefined values using JSON semantics', () => {
    expect(serializeIntent({ optional: undefined, empty: null })).toEqual({ empty: null })
  })
})
