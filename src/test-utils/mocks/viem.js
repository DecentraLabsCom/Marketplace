/**
 * Mock for 'viem' utility functions.
 * ------------------------------------------------
 * Provides simplified implementations for:
 *  - parseUnits(value, decimals): converts a number/string to BigInt in smallest units
 *  - formatUnits(value, decimals): converts BigInt or number from smallest units to string
 * Useful for testing token amount calculations without real blockchain conversions.
 */

module.exports = {
  parseUnits: (value, decimals = 18) => {
    const num = Number(value);
    if (Number.isNaN(num)) return 0n;
    return BigInt(Math.floor(num * Math.pow(10, decimals)));
  },
  formatUnits: (value, decimals = 18) => {
    try {
      const n = typeof value === 'bigint' ? Number(value) : Number(value);
      return (n / Math.pow(10, decimals)).toString();
    } catch {
      return '0';
    }
  },
};