import { createSSRSafeQuery, isClientSide, isServerSide } from '../ssrSafe'

describe('ssrSafe utilities (browser/jsdom)', () => {
  test('isClientSide/isServerSide reflect window presence', () => {
    expect(isClientSide()).toBe(true)
    expect(isServerSide()).toBe(false)
  })

  test('createSSRSafeQuery calls service function on client', async () => {
    const serviceFn = jest.fn(async (a, b) => a + b)
    const queryFn = createSSRSafeQuery(serviceFn, 0)
    await expect(queryFn(2, 3)).resolves.toBe(5)
    expect(serviceFn).toHaveBeenCalledWith(2, 3)
  })
})

