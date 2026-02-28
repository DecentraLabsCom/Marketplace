/**
 * Blockchain Error Classifier
 * Extracts concise, user-facing error messages from blockchain, wallet, and intent errors.
 * All messages are designed to be short (< 60 chars) to fit notification toasts.
 *
 * @module classifyBlockchainError
 */

/**
 * Known error code mappings for intent/authorization flows.
 * Keys are error codes set on Error objects (e.g., error.code).
 * @type {Object<string, {message: string, priority: string, duration: number}>}
 */
const ERROR_CODE_MAP = {
  INTENT_AUTH_CANCELLED: {
    message: '🚫 Authorization cancelled',
    priority: 'normal',
    duration: 3500,
  },
  INTENT_AUTH_SESSION_UNAVAILABLE: {
    message: '❌ Authorization session expired',
    priority: 'high',
    duration: 5000,
  },
  WEBAUTHN_CREDENTIAL_NOT_REGISTERED: {
    message: '❌ Credential not registered',
    priority: 'high',
    duration: 5000,
  },
  ACTION_REJECTED: {
    message: '🚫 Transaction rejected by user',
    priority: 'normal',
    duration: 3500,
  },
}

/**
 * Numeric wallet error codes (MetaMask / EIP-1193).
 * @type {Object<number, {message: string, priority: string, duration: number}>}
 */
const NUMERIC_CODE_MAP = {
  4001: {
    message: '🚫 Transaction rejected by user',
    priority: 'normal',
    duration: 3500,
  },
  4100: {
    message: '❌ Wallet account not authorized',
    priority: 'high',
    duration: 5000,
  },
  4200: {
    message: '❌ Method not supported by wallet',
    priority: 'high',
    duration: 5000,
  },
  4900: {
    message: '❌ Wallet disconnected',
    priority: 'high',
    duration: 5000,
  },
  4901: {
    message: '❌ Wallet not connected to chain',
    priority: 'high',
    duration: 5000,
  },
}

/**
 * Message-based pattern matchers, ordered by specificity (most specific first).
 * Each entry has: pattern (string or RegExp), and the resulting classification.
 * @type {Array<{pattern: string|RegExp, message: string, priority: string, duration: number}>}
 */
const MESSAGE_PATTERNS = [
  // Revert / on-chain rejection patterns
  {
    pattern: /execution reverted:?\s*reservation.*already\s*exists/i,
    message: '❌ Time slot already booked',
    priority: 'high',
    duration: 5000,
  },
  {
    pattern: /execution reverted:?\s*not\s*listed/i,
    message: '❌ Lab is currently not listed',
    priority: 'high',
    duration: 5000,
  },
  {
    pattern: /execution reverted:?\s*invalid\s*time/i,
    message: '❌ Invalid time slot selected',
    priority: 'high',
    duration: 5000,
  },
  {
    pattern: /execution reverted/i,
    message: '❌ Transaction reverted on-chain',
    priority: 'high',
    duration: 5000,
  },
  // Gas / fee estimation failures
  {
    pattern: /gas required exceeds|out of gas/i,
    message: '❌ Transaction requires too much gas',
    priority: 'high',
    duration: 5000,
  },
  {
    pattern: /max fee per gas/i,
    message: '❌ Gas fee exceeds limit',
    priority: 'high',
    duration: 5000,
  },
  // Nonce / replacement issues
  {
    pattern: /nonce.*too\s*(low|high)|replacement.*underpriced/i,
    message: '❌ Transaction conflict — try again',
    priority: 'high',
    duration: 5000,
  },
  // Intent / authorization patterns
  {
    pattern: /authorization\s*cancelled/i,
    message: '🚫 Authorization cancelled',
    priority: 'normal',
    duration: 3500,
  },
  {
    pattern: /intent\s*authorization\s*failed/i,
    message: '❌ Authorization failed',
    priority: 'high',
    duration: 5000,
  },
  {
    pattern: /intent.*expired|request\s*expired/i,
    message: '❌ Request expired — try again',
    priority: 'high',
    duration: 5000,
  },
  {
    pattern: /prepare.*reservation.*intent|failed to prepare/i,
    message: '❌ Could not prepare reservation',
    priority: 'high',
    duration: 5000,
  },
  // Allowance / approval issues
  {
    pattern: /allowance.*not\s*updated|approval\s*confirmation/i,
    message: '❌ Token approval not confirmed',
    priority: 'high',
    duration: 5000,
  },
  // RPC / provider issues
  {
    pattern: /could not detect network|unknown network/i,
    message: '❌ Network not detected',
    priority: 'high',
    duration: 5000,
  },
  {
    pattern: /rate\s*limit|429|too\s*many\s*requests/i,
    message: '⚠️ Too many requests — wait and retry',
    priority: 'normal',
    duration: 5000,
  },
  {
    pattern: /internal\s*(json-?rpc|server)\s*error/i,
    message: '❌ Blockchain node error',
    priority: 'high',
    duration: 5000,
  },
  // WebAuthn
  {
    pattern: /webauthn.*not\s*supported/i,
    message: '❌ WebAuthn not supported here',
    priority: 'high',
    duration: 5000,
  },
  // Missing institution backend
  {
    pattern: /missing\s*institutional\s*backend/i,
    message: '❌ Institution backend unavailable',
    priority: 'high',
    duration: 5000,
  },
]

/**
 * Classifies a blockchain/wallet/intent error into a concise, user-facing notification payload.
 *
 * Resolution order:
 * 1. `error.userMessage` (from EnhancedError instances)
 * 2. `error.code` (string or numeric wallet codes)
 * 3. Message pattern matching against `error.message` and `error.shortMessage`
 * 4. Returns `null` if no specific classification is found (caller should use its own fallback)
 *
 * @param {Error|EnhancedError|Object|string} error - The error to classify
 * @returns {{message: string, priority: string, duration: number}|null} Classification result or null
 */
export function classifyBlockchainError(error) {
  if (!error) return null

  // 1. EnhancedError metadata (has explicit userMessage set by the error system)
  if (error.userMessage && error.userMessage !== 'An unexpected error occurred') {
    return {
      message: `❌ ${truncateMessage(error.userMessage)}`,
      priority: mapSeverityToPriority(error.severity),
      duration: mapSeverityToDuration(error.severity),
    }
  }

  // 2. Known error codes (string)
  if (typeof error.code === 'string' && ERROR_CODE_MAP[error.code]) {
    return { ...ERROR_CODE_MAP[error.code] }
  }

  // 3. Known error codes (numeric — MetaMask / EIP-1193)
  if (typeof error.code === 'number' && NUMERIC_CODE_MAP[error.code]) {
    return { ...NUMERIC_CODE_MAP[error.code] }
  }

  // 4. Pattern match on message text
  const message = error.message || ''
  const shortMessage = error.shortMessage || ''
  const combinedText = `${message} ${shortMessage}`

  for (const entry of MESSAGE_PATTERNS) {
    if (entry.pattern instanceof RegExp) {
      if (entry.pattern.test(combinedText)) {
        return { message: entry.message, priority: entry.priority, duration: entry.duration }
      }
    } else if (typeof entry.pattern === 'string') {
      if (combinedText.toLowerCase().includes(entry.pattern.toLowerCase())) {
        return { message: entry.message, priority: entry.priority, duration: entry.duration }
      }
    }
  }

  return null
}

/**
 * Truncates a user message to keep notification text concise.
 * Strips leading emoji if already present.
 * @param {string} msg - Message to truncate
 * @param {number} [maxLen=50] - Max characters
 * @returns {string} Truncated message
 */
function truncateMessage(msg, maxLen = 50) {
  if (!msg || typeof msg !== 'string') return 'An error occurred'
  // Strip leading emoji followed by space (we add our own).
  // Use alternation instead of a character class — ⚠️ and ℹ️ are multi-codepoint
  // sequences (base + variation selector U+FE0F) that are invalid inside [...].
  const cleaned = msg.replace(/^(?:❌|⚠️|🚫|✅|ℹ️|🔄)+\s*/u, '').trim()
  if (cleaned.length <= maxLen) return cleaned
  return cleaned.slice(0, maxLen - 1) + '…'
}

/**
 * Maps EnhancedError severity to notification priority
 * @param {string} [severity] - Error severity level
 * @returns {string} Notification priority
 */
function mapSeverityToPriority(severity) {
  switch (severity) {
    case 'critical': return 'critical'
    case 'high': return 'high'
    case 'low': return 'low'
    default: return 'normal'
  }
}

/**
 * Maps EnhancedError severity to notification duration (ms)
 * @param {string} [severity] - Error severity level
 * @returns {number} Duration in milliseconds
 */
function mapSeverityToDuration(severity) {
  switch (severity) {
    case 'critical': return 7000
    case 'high': return 6000
    case 'low': return 4000
    default: return 5000
  }
}
