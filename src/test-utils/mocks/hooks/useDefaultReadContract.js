/**
 * Mock for useDefaultReadContract hook.
 */

module.exports = jest.fn((methodName) => {
  if (methodName === 'getServiceCreditBalance') return { data: 1000n, refetch: jest.fn(), isLoading: false }
  if (methodName === 'balanceOf') return { data: 1000n, refetch: jest.fn(), isLoading: false }
  if (methodName === 'allowance') return { data: 500n, refetch: jest.fn(), isLoading: false }
  if (methodName === 'decimals') return { data: 18, refetch: jest.fn(), isLoading: false }
  return { data: undefined, refetch: jest.fn(), isLoading: false }
})
