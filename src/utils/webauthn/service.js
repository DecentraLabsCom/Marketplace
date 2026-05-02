import { getNormalizedPucFromSession } from '@/utils/auth/puc'

export function getUserIdFromSession(session) {
  return getNormalizedPucFromSession(session)
}

export function getPucFromSession(session) {
  return getUserIdFromSession(session)
}

export default {
  getUserIdFromSession,
  getPucFromSession,
}
