/**
 * Development-only logger utility
 * Logs are only shown in localhost/development environment
 */

// Track module load logs to prevent duplicates in StrictMode
const moduleLoadLogs = new Set();

export const isDebugEnabled = () => {
  return String(process.env.NEXT_PUBLIC_DEBUG_MODE || '').toLowerCase() === 'true';
};

const isDevelopment = () => {
  return process.env.NODE_ENV === 'development' || isDebugEnabled();
};

const emit = (method, ...args) => {
  if (!isDevelopment()) return;
  const logger = typeof console[method] === 'function' ? console[method] : console.log;
  logger(...args);
};

const devLog = {
  log: (...args) => {
    emit('log', ...args);
  },

  // Special method for module load logs that should only appear once
  moduleLoaded: (message) => {
    if (isDevelopment() && !moduleLoadLogs.has(message)) {
      moduleLoadLogs.add(message);
      emit('log', message);
    }
  },

  warn: (...args) => {
    emit('warn', ...args);
  },

  error: (...args) => {
    emit('error', ...args);
  },

  info: (...args) => {
    emit('info', ...args);
  },

  debug: (...args) => {
    emit('debug', ...args);
  },

  success: (...args) => {
    emit('info', ...args);
  },

  mutation: (...args) => {
    emit('debug', ...args);
  },

  // Backward-compatible alias used by older call sites.
  service: (...args) => {
    emit('log', ...args);
  },
};

// Legacy support - export individual functions
export const { log, warn, error, info, debug, success, mutation, moduleLoaded, service } = devLog;

// Named export
export { devLog };

// Default export
export default devLog;
