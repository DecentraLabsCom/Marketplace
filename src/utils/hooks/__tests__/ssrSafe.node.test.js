/**
 * @jest-environment node
 */

import { createSSRSafeQuery, isClientSide, isServerSide } from '../ssrSafe'

describe('ssrSafe utilities (node/SSR)', () => {
  test('isClientSide/isServerSide reflect SSR environment', () => {
    expect(isClientSide()).toBe(false)
    expect(isServerSide()).toBe(true)
  })

  test('createSSRSafeQuery returns fallback during SSR', async () => {
    const serviceFn = jest.fn(async () => ['should-not-run'])
    const queryFn = createSSRSafeQuery(serviceFn, ['fallback'])
    await expect(queryFn('arg')).resolves.toEqual(['fallback'])
    expect(serviceFn).not.toHaveBeenCalled()
  })
})

