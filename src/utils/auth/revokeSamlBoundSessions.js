import { deleteServerSession } from './sessionStore'
import {
  clearSamlSessionBinding,
  getSamlSessionIds,
} from './samlSessionStateStore'
import { revokeFmuContextsForSessions } from './revokeFmuContexts'

export async function revokeSamlBoundSessions(nameId, sessionIndex) {
  const sessionIds = await getSamlSessionIds(nameId, sessionIndex)
  await revokeFmuContextsForSessions(sessionIds)
  await Promise.all(sessionIds.map((sessionId) => deleteServerSession(sessionId)))
  await clearSamlSessionBinding(nameId, sessionIndex)
  return sessionIds
}
