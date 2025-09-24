/**
 * Mock for useDefaultReadContract hook.
 * ------------------------------------------------
 * Provides deterministic return values for common contract read methods:
 *  - balanceOf → 1000n
 *  - allowance → 500n
 *  - decimals  → 18
 * Other methods return undefined with a dummy refetch.
 */

module.exports = jest.fn((methodName, args, enabled = false, contractKey) => {
  if (methodName === 'balanceOf') return { data: 1000n, refetch: jest.fn() };
  if (methodName === 'allowance') return { data: 500n, refetch: jest.fn() };
  if (methodName === 'decimals') return { data: 18 };
  return { data: undefined, refetch: jest.fn() };
});