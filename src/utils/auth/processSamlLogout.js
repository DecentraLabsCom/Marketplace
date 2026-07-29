import { revokeFmuContexts } from './revokeFmuContexts'
import { revokeSamlBoundSessions } from './revokeSamlBoundSessions'
import {
  completeSamlLogoutRequest,
  getDueSamlLogoutRequests,
  rescheduleSamlLogoutRequest,
} from './samlLogoutOutbox'

export async function processSamlLogoutRequest(record, cookieStore) {
  try {
    await revokeSamlBoundSessions(record.nameId, record.sessionIndex)
    if (cookieStore) await revokeFmuContexts(cookieStore)
    await completeSamlLogoutRequest(record.requestId)
  } catch (error) {
    await rescheduleSamlLogoutRequest({
      requestId: record.requestId,
      attempts: record.attempts,
    }).catch(() => {})
    throw error
  }
}

export async function drainSamlLogoutOutbox({ limit = 100 } = {}) {
  const entries = await getDueSamlLogoutRequests({ limit })
  const results = await Promise.all(entries.map(async (entry) => {
    try {
      await processSamlLogoutRequest(entry)
      return true
    } catch {
      return false
    }
  }))
  return {
    checked: results.length,
    completed: results.filter(Boolean).length,
    pending: results.filter((result) => !result).length,
  }
}
