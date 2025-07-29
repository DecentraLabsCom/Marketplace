/**
 * Development-only logger utility
 * Logs are only shown in localhost/development environment
 */

const isDevelopment = () => {
  return process.env.NODE_ENV === 'development';
};

const devLog = {
  log: (...args) => {
    if (isDevelopment()) {
      console.log(...args);
    }
  },
  
  warn: (...args) => {
    if (isDevelopment()) {
      console.warn(...args);
    }
  },
  
  error: (...args) => {
    if (isDevelopment()) {
      console.error(...args);
    }
  },
  
  info: (...args) => {
    if (isDevelopment()) {
      console.info(...args);
    }
  }
};

// Legacy support - export individual functions
export const { log, warn, error, info, service } = devLog;

// Named export
export { devLog };

// Default export
export default devLog;
