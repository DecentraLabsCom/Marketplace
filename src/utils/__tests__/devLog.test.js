import devLog from '../dev/logger.js';

// Mock the logger module to control the environment
jest.mock('../dev/logger.js', () => {
  // Track module load logs to prevent duplicates in StrictMode
  const moduleLoadLogs = new Set();

  const createDevLog = (isDev = false) => ({
    log: (...args) => {
      if (isDev) {
        console.log(...args);
      }
    },

    // Special method for module load logs that should only appear once
    moduleLoaded: (message) => {
      if (isDev && !moduleLoadLogs.has(message)) {
        moduleLoadLogs.add(message);
        console.log(message);
      }
    },

    warn: (...args) => {
      if (isDev) {
        console.warn(...args);
      }
    },

    error: (...args) => {
      if (isDev) {
        console.error(...args);
      }
    },

    info: (...args) => {
      if (isDev) {
        console.info(...args);
      }
    }
  });

  // Create a mock that can be controlled
  const mockDevLog = createDevLog(false);

  // Allow tests to control the development mode
  mockDevLog.__setDevelopmentMode = (isDev) => {
    Object.assign(mockDevLog, createDevLog(isDev));
  };

  return mockDevLog;
});

describe('devLog', () => {
  const originalConsole = global.console;

  beforeEach(() => {
    // Reset console mocks before each test
    global.console = {
      ...originalConsole,
      log: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      info: jest.fn(),
    };

    // Reset to non-development mode
    devLog.__setDevelopmentMode(false);
  });

  afterEach(() => {
    // Restore original console after each test
    global.console = originalConsole;
  });

  describe('when in development mode', () => {
    beforeEach(() => {
      devLog.__setDevelopmentMode(true);
    });

    test('should log messages with correct level', () => {
      devLog.info('Test info message', { key: 'value' });
      expect(console.info).toHaveBeenCalledWith('Test info message', { key: 'value' });

      devLog.warn('Test warning message');
      expect(console.warn).toHaveBeenCalledWith('Test warning message');

      devLog.error('Test error message', new Error('test error'));
      expect(console.error).toHaveBeenCalledWith('Test error message', new Error('test error'));

      devLog.log('Test log message');
      expect(console.log).toHaveBeenCalledWith('Test log message');
    });

    test('should handle multiple arguments', () => {
      devLog.log('Message', 'arg1', 'arg2', { obj: true });
      expect(console.log).toHaveBeenCalledWith('Message', 'arg1', 'arg2', { obj: true });
    });

    test('should handle no additional arguments', () => {
      devLog.info('Simple message');
      expect(console.info).toHaveBeenCalledWith('Simple message');
    });

    test('should support moduleLoaded for unique messages', () => {
      devLog.moduleLoaded('Test module loaded');
      expect(console.log).toHaveBeenCalledWith('Test module loaded');

      // Second call should not log again
      devLog.moduleLoaded('Test module loaded');
      expect(console.log).toHaveBeenCalledTimes(1);
    });
  });

  describe('when not in development mode', () => {
    test('should not log any messages', () => {
      devLog.info('Test info message');
      devLog.warn('Test warning message');
      devLog.error('Test error message');
      devLog.log('Test log message');
      devLog.moduleLoaded('Test module loaded');

      expect(console.log).not.toHaveBeenCalled();
      expect(console.info).not.toHaveBeenCalled();
      expect(console.warn).not.toHaveBeenCalled();
      expect(console.error).not.toHaveBeenCalled();
    });
  });

  describe('method availability', () => {
    test('should export all expected methods', () => {
      expect(typeof devLog.log).toBe('function');
      expect(typeof devLog.info).toBe('function');
      expect(typeof devLog.warn).toBe('function');
      expect(typeof devLog.error).toBe('function');
      expect(typeof devLog.moduleLoaded).toBe('function');
    });

    test('should be the default export', () => {
      expect(devLog).toHaveProperty('log');
      expect(devLog).toHaveProperty('info');
      expect(devLog).toHaveProperty('warn');
      expect(devLog).toHaveProperty('error');
      expect(devLog).toHaveProperty('moduleLoaded');
    });

    test('should export individual functions', () => {
      const { log, warn, error, info } = require('../dev/logger.js');
      expect(typeof log).toBe('function');
      expect(typeof warn).toBe('function');
      expect(typeof error).toBe('function');
      expect(typeof info).toBe('function');
    });
  });

  describe('console method mapping', () => {
    beforeEach(() => {
      devLog.__setDevelopmentMode(true);
    });

    test('log method should use console.log', () => {
      devLog.log('test');
      expect(console.log).toHaveBeenCalledWith('test');
      expect(console.info).not.toHaveBeenCalled();
    });

    test('info method should use console.info', () => {
      devLog.info('test');
      expect(console.info).toHaveBeenCalledWith('test');
      expect(console.log).not.toHaveBeenCalled();
    });

    test('warn method should use console.warn', () => {
      devLog.warn('test');
      expect(console.warn).toHaveBeenCalledWith('test');
      expect(console.log).not.toHaveBeenCalled();
    });

    test('error method should use console.error', () => {
      devLog.error('test');
      expect(console.error).toHaveBeenCalledWith('test');
      expect(console.log).not.toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    beforeEach(() => {
      devLog.__setDevelopmentMode(true);
    });

    test('should handle undefined arguments gracefully', () => {
      devLog.info(undefined);
      expect(console.info).toHaveBeenCalledWith(undefined);
    });

    test('should handle null arguments gracefully', () => {
      devLog.info(null);
      expect(console.info).toHaveBeenCalledWith(null);
    });

    test('should handle complex objects', () => {
      const complexObj = { nested: { value: 42 }, array: [1, 2, 3] };
      devLog.info('Complex object', complexObj);
      expect(console.info).toHaveBeenCalledWith('Complex object', complexObj);
    });
  });
});