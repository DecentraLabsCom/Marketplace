/**
 * Mock for @/utils/dev/logger
 * Provides jest.fn() mocks for all logger methods
 */
const devLog = {
  log: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  info: jest.fn(),
  moduleLoaded: jest.fn(),
};

// Legacy support
export const log = devLog.log;
export const warn = devLog.warn;
export const error = devLog.error;
export const info = devLog.info;

export default devLog;
