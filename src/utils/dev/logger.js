/**
 * Development-only logger utility
 * Logs are only shown in localhost/development environment
 */

// Track module load logs to prevent duplicates in StrictMode
const moduleLoadLogs = new Set();

const isDevelopment = () => {
  return process.env.NODE_ENV === 'development';
};

const devLog = {
  log: (...args) => {
    if (isDevelopment()) {
      console.log(...args);
    }
  },
  
  // Special method for module load logs that should only appear once
  moduleLoaded: (message) => {
    if (isDevelopment() && !moduleLoadLogs.has(message)) {
      moduleLoadLogs.add(message);
      console.log(message);
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
