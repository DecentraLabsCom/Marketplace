/**
 * Tests for classifyBlockchainError utility
 *
 * Validates that blockchain, wallet, and intent errors are correctly
 * classified into concise, user-facing notification payloads.
 *
 * Coverage:
 * - EnhancedError userMessage resolution
 * - String error codes (intent flows)
 * - Numeric error codes (MetaMask / EIP-1193)
 * - Message pattern matching (reverts, gas, nonce, auth, RPC)
 * - Null return for unrecognised errors
 * - Edge cases (empty/null/undefined inputs)
 */
import { classifyBlockchainError } from '@/utils/blockchain/classifyBlockchainError'

describe('classifyBlockchainError', () => {
  // ── EnhancedError metadata ──────────────────────────────────────────

  describe('EnhancedError userMessage resolution', () => {
    test('uses userMessage from EnhancedError with severity mapping', () => {
      const error = new Error('raw internal message')
      error.userMessage = 'Blockchain transaction error. Please try again.'
      error.severity = 'high'

      const result = classifyBlockchainError(error)

      expect(result).not.toBeNull()
      expect(result.message).toContain('Blockchain transaction error')
      expect(result.priority).toBe('high')
      expect(result.duration).toBe(6000)
    })

    test('ignores default userMessage "An unexpected error occurred"', () => {
      const error = new Error('execution reverted')
      error.userMessage = 'An unexpected error occurred'

      const result = classifyBlockchainError(error)

      // Should fall through to pattern matching, not use the generic userMessage
      expect(result).not.toBeNull()
      expect(result.message).toBe('❌ Transaction reverted on-chain')
    })

    test('truncates long userMessage to keep notifications concise', () => {
      const error = new Error('raw message')
      error.userMessage = 'A'.repeat(80)
      error.severity = 'medium'

      const result = classifyBlockchainError(error)

      expect(result).not.toBeNull()
      expect(result.message.length).toBeLessThanOrEqual(60) // ❌ + space + 50 + …
    })

    test('maps severity=critical to priority=critical', () => {
      const error = new Error('fatal')
      error.userMessage = 'Critical failure'
      error.severity = 'critical'

      const result = classifyBlockchainError(error)
      expect(result.priority).toBe('critical')
      expect(result.duration).toBe(7000)
    })

    test('maps severity=low to priority=low', () => {
      const error = new Error('minor')
      error.userMessage = 'Minor issue'
      error.severity = 'low'

      const result = classifyBlockchainError(error)
      expect(result.priority).toBe('low')
      expect(result.duration).toBe(4000)
    })
  })

  // ── String error codes (intent flows) ───────────────────────────────

  describe('string error codes', () => {
    test('classifies INTENT_AUTH_CANCELLED', () => {
      const error = new Error('cancelled')
      error.code = 'INTENT_AUTH_CANCELLED'

      const result = classifyBlockchainError(error)
      expect(result.message).toBe('🚫 Authorization cancelled')
      expect(result.priority).toBe('normal')
    })

    test('classifies INTENT_AUTH_SESSION_UNAVAILABLE', () => {
      const error = new Error('session gone')
      error.code = 'INTENT_AUTH_SESSION_UNAVAILABLE'

      const result = classifyBlockchainError(error)
      expect(result.message).toBe('❌ Authorization session expired')
      expect(result.priority).toBe('high')
    })

    test('classifies WEBAUTHN_CREDENTIAL_NOT_REGISTERED', () => {
      const error = new Error('no credential')
      error.code = 'WEBAUTHN_CREDENTIAL_NOT_REGISTERED'

      const result = classifyBlockchainError(error)
      expect(result.message).toBe('❌ Credential not registered')
    })

    test('classifies ACTION_REJECTED', () => {
      const error = new Error('rejected')
      error.code = 'ACTION_REJECTED'

      const result = classifyBlockchainError(error)
      expect(result.message).toBe('🚫 Transaction rejected by user')
    })
  })

  // ── Numeric error codes (MetaMask / EIP-1193) ──────────────────────

  describe('numeric error codes', () => {
    test('classifies 4001 (user rejection)', () => {
      const error = new Error('MetaMask - RPC Error')
      error.code = 4001

      const result = classifyBlockchainError(error)
      expect(result.message).toBe('🚫 Transaction rejected by user')
      expect(result.priority).toBe('normal')
    })

    test('classifies 4900 (wallet disconnected)', () => {
      const error = new Error('disconnected')
      error.code = 4900

      const result = classifyBlockchainError(error)
      expect(result.message).toBe('❌ Wallet disconnected')
    })

    test('classifies 4901 (chain disconnected)', () => {
      const error = new Error('chain disconnected')
      error.code = 4901

      const result = classifyBlockchainError(error)
      expect(result.message).toBe('❌ Wallet not connected to chain')
    })
  })

  // ── Message pattern matching ────────────────────────────────────────

  describe('message pattern matching', () => {
    test('classifies "execution reverted" errors', () => {
      const result = classifyBlockchainError(new Error('execution reverted: some reason'))
      expect(result.message).toBe('❌ Transaction reverted on-chain')
    })

    test('classifies specific reservation-already-exists revert', () => {
      const result = classifyBlockchainError(
        new Error('execution reverted: reservation already exists for this slot')
      )
      expect(result.message).toBe('❌ Time slot already booked')
    })

    test('classifies "not listed" revert', () => {
      const result = classifyBlockchainError(
        new Error('execution reverted: not listed')
      )
      expect(result.message).toBe('❌ Lab is currently not listed')
    })

    test('classifies "invalid time" revert', () => {
      const result = classifyBlockchainError(
        new Error('execution reverted: invalid time range')
      )
      expect(result.message).toBe('❌ Invalid time slot selected')
    })

    test('classifies out-of-gas errors', () => {
      const result = classifyBlockchainError(new Error('out of gas'))
      expect(result.message).toBe('❌ Transaction requires too much gas')
    })

    test('classifies gas-limit errors', () => {
      const result = classifyBlockchainError(new Error('gas required exceeds allowance'))
      expect(result.message).toBe('❌ Transaction requires too much gas')
    })

    test('classifies nonce errors', () => {
      const result = classifyBlockchainError(new Error('nonce too low'))
      expect(result.message).toBe('❌ Transaction conflict — try again')
    })

    test('classifies replacement underpriced', () => {
      const result = classifyBlockchainError(new Error('replacement transaction underpriced'))
      expect(result.message).toBe('❌ Transaction conflict — try again')
    })

    test('classifies authorization cancelled in message', () => {
      const result = classifyBlockchainError(new Error('Authorization cancelled'))
      expect(result.message).toBe('🚫 Authorization cancelled')
    })

    test('classifies intent authorization failed', () => {
      const result = classifyBlockchainError(new Error('intent authorization failed'))
      expect(result.message).toBe('❌ Authorization failed')
    })

    test('classifies intent/request expired', () => {
      const result = classifyBlockchainError(new Error('intent expired'))
      expect(result.message).toBe('❌ Request expired — try again')
    })

    test('classifies preparation failures', () => {
      const result = classifyBlockchainError(new Error('failed to prepare reservation intent'))
      expect(result.message).toBe('❌ Could not prepare reservation')
    })

    test('classifies allowance not updated', () => {
      const result = classifyBlockchainError(new Error('Allowance not updated after approval confirmation'))
      expect(result.message).toBe('❌ Token approval not confirmed')
    })

    test('classifies rate limit errors', () => {
      const result = classifyBlockchainError(new Error('rate limit exceeded'))
      expect(result.message).toBe('⚠️ Too many requests — wait and retry')
    })

    test('classifies internal JSON-RPC errors', () => {
      const result = classifyBlockchainError(new Error('Internal JSON-RPC error'))
      expect(result.message).toBe('❌ Blockchain node error')
    })

    test('classifies WebAuthn not supported', () => {
      const result = classifyBlockchainError(new Error('WebAuthn not supported in this environment'))
      expect(result.message).toBe('❌ WebAuthn not supported here')
    })

    test('classifies missing institutional backend', () => {
      const result = classifyBlockchainError(new Error('Missing institutional backend URL'))
      expect(result.message).toBe('❌ Institution backend unavailable')
    })

    test('matches against shortMessage as well', () => {
      const error = new Error('some generic wrapper')
      error.shortMessage = 'execution reverted: not listed'

      const result = classifyBlockchainError(error)
      expect(result.message).toBe('❌ Lab is currently not listed')
    })
  })

  // ── Null return for unrecognised errors ────────────────────────────

  describe('unrecognised errors', () => {
    test('returns null for generic Error with no matching pattern', () => {
      const result = classifyBlockchainError(new Error('something happened'))
      expect(result).toBeNull()
    })

    test('returns null for completely unknown code', () => {
      const error = new Error('unknown')
      error.code = 'UNKNOWN_CODE_XYZ'

      const result = classifyBlockchainError(error)
      expect(result).toBeNull()
    })
  })

  // ── Edge cases ─────────────────────────────────────────────────────

  describe('edge cases', () => {
    test('returns null for null input', () => {
      expect(classifyBlockchainError(null)).toBeNull()
    })

    test('returns null for undefined input', () => {
      expect(classifyBlockchainError(undefined)).toBeNull()
    })

    test('returns null for empty object', () => {
      expect(classifyBlockchainError({})).toBeNull()
    })

    test('handles error with only shortMessage (no message)', () => {
      const error = { shortMessage: 'execution reverted' }
      const result = classifyBlockchainError(error)
      expect(result).not.toBeNull()
      expect(result.message).toBe('❌ Transaction reverted on-chain')
    })

    test('string code takes precedence over message pattern', () => {
      const error = new Error('execution reverted')
      error.code = 'INTENT_AUTH_CANCELLED'

      const result = classifyBlockchainError(error)
      // Code should win over message pattern
      expect(result.message).toBe('🚫 Authorization cancelled')
    })

    test('userMessage takes precedence over code', () => {
      const error = new Error('internal')
      error.code = 'INTENT_AUTH_CANCELLED'
      error.userMessage = 'Custom user message'
      error.severity = 'high'

      const result = classifyBlockchainError(error)
      expect(result.message).toContain('Custom user message')
    })
  })
})
