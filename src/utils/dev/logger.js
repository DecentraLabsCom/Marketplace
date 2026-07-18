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

function escapeLogControlCharacters(value) {
  let escaped = '';
  for (const character of value) {
    const codePoint = character.codePointAt(0);
    const isAsciiControl = codePoint <= 0x1F;
    const isC1Control = codePoint >= 0x7F && codePoint <= 0x9F;
    const isLineSeparator = codePoint === 0x2028 || codePoint === 0x2029;

    escaped += isAsciiControl || isC1Control || isLineSeparator
      ? `\\u${codePoint.toString(16).padStart(4, '0')}`
      : character;
  }
  return escaped;
}

function redactString(value) {
  return escapeLogControlCharacters(value.replace(BEARER_VALUE, 'Bearer [REDACTED]'));
}

function redactLogValue(value, seen = new WeakSet()) {
  if (typeof value === 'string') return redactString(value);
  if (typeof value === 'bigint') return value.toString();
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
  logger(...args.map((arg) => JSON.stringify(redactLogValue(arg))));
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

};

export const { log, warn, error, info, debug, success, mutation, moduleLoaded } = devLog;

// Named export
export { devLog };

// Default export
export default devLog;
