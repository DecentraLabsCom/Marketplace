/**
 * API Route: GET /api/onboarding/events (SSE)
 *
 * Streams onboarding status updates to the browser so the UI can update
 * immediately after the Institutional Backend calls /api/onboarding/callback.
 *
 * This is a minimal viable SSE implementation; polling remains as fallback.
 */

export const runtime = 'nodejs'

import { onboardingEventBus } from '../_eventBus'
import { getOnboardingResult } from '@/utils/onboarding'

const buildLookupKeys = ({ stableUserId, sessionId, institutionId }) => {
  const keys = []
  if (sessionId) keys.push(`session:${sessionId}`)
  if (stableUserId && institutionId) keys.push(`${institutionId}:${stableUserId}`)
  if (stableUserId) keys.push(`user:${stableUserId}`)
  return keys
}

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const stableUserId = searchParams.get('stableUserId') || null
  const sessionId = searchParams.get('sessionId') || null
  const institutionId = searchParams.get('institutionId') || null

  const lookupKeys = buildLookupKeys({ stableUserId, sessionId, institutionId })
  if (lookupKeys.length === 0) {
    return new Response('Missing stableUserId or sessionId', { status: 400 })
  }

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    start(controller) {
      const send = (data, eventName = 'onboarding') => {
        controller.enqueue(encoder.encode(`event: ${eventName}\n`))
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
      }

      // Send last-known result immediately (if any)
      for (const key of lookupKeys) {
        const existing = getOnboardingResult(key)
        if (existing) {
          send({ ...existing, key, source: 'store' }, 'onboarding')
          break
        }
      }

      const unsubscribe = onboardingEventBus.subscribe(lookupKeys, (payload) => {
        send({ ...payload, source: 'callback' }, 'onboarding')
      })

      const ping = setInterval(() => {
        controller.enqueue(encoder.encode(`event: ping\ndata: {}\n\n`))
      }, 25_000)

      const close = () => {
        clearInterval(ping)
        unsubscribe()
        try {
          controller.close()
        } catch {
          // ignore
        }
      }

      if (request.signal) {
        request.signal.addEventListener('abort', close, { once: true })
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  })
}

