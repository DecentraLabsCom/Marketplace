/**
 * Development-only logger utility
 * Logs are only shown in localhost/development environment
 */

// Track module load logs to prevent duplicates in StrictMode
const moduleLoadLogs = new Set();

export const isDebugEnabled = () => {
  return process.env.NODE_ENV === 'development';
};

const isDevelopment = () => {
  return process.env.NODE_ENV === 'development';
};

const SENSITIVE_FIELD = /(?:token|authorization|cookie|secret|password|assertion|credential|private[_-]?key|api[_-]?key)/i;
const BEARER_VALUE = /\bbearer\s+[^\s,;]+/gi;
const LOG_CONTROL_CHARACTER = /[\u0000-\u001F\u007F-\u009F]/g;

function escapeLogControlCharacters(value) {
  return value.replace(LOG_CONTROL_CHARACTER, (character) => (
    `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`
  ));
}

function redactString(value) {
  return escapeLogControlCharacters(value.replace(BEARER_VALUE, 'Bearer [REDACTED]'));
}

function redactLogValue(value, seen = new WeakSet()) {
  if (typeof value === 'string') return redactString(value);
  if (value === null || typeof value !== 'object') return value;
  if (seen.has(value)) return '[Circular]';
  seen.add(value);

  if (value instanceof Error) {
    return {
      name: redactString(String(value.name || 'Error')),
      message: redactString(String(value.message || '')),
    };
  }
  if (Array.isArray(value)) return value.map((item) => redactLogValue(item, seen));

  return Object.fromEntries(Object.entries(value).map(([key, item]) => [
    redactString(key),
    SENSITIVE_FIELD.test(key) ? '[REDACTED]' : redactLogValue(item, seen),
  ]));
}

const emit = (method, ...args) => {
  if (!isDevelopment()) return;
  const logger = typeof console[method] === 'function' ? console[method] : console.log;
  logger(...args.map((arg) => redactLogValue(arg)));
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
