/**
 * Mock for useContractWriteFunction hook.
 * ------------------------------------------------
 * Returns a default jest.fn() that resolves to a fake tx hash.
 * Keeps tests isolated from real blockchain writes.
 */

module.exports = jest.fn((fnName, contractKey) => {
  return { contractWriteFunction: jest.fn().mockResolvedValue('0xtxhash') };
});