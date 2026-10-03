import { NextResponse } from 'next/server'
import { requireAuth, handleGuardError } from '@/utils/auth/guards'
import { resolveBackendUrlForSession, resolveForwardHeaders } from '@/utils/api/backendProxyHelpers'

export async function GET(request, { params }) {
  try {
    const session = await requireAuth()
    const { labId } = await params
    if (!/^\d+$/.test(String(labId)) || BigInt(labId) <= 0n) {
      return NextResponse.json({ error: 'Invalid lab id' }, { status: 400 })
    }
    const { backendUrl, institutionDomain } = await resolveBackendUrlForSession()
    const institutionalSessionToken = session?.institutionalBackendSessionToken
    if (!backendUrl || !institutionDomain || !institutionalSessionToken) {
      return NextResponse.json({ error: 'Institutional session required' }, { status: 401 })
    }
    const query = new URL(request.url).searchParams
    const categories = query.getAll('category')
    const backendAuth = await resolveForwardHeaders({ backendUrl, institutionId: institutionDomain, scope: 'access-policy:evaluate' })
    const headers = { ...backendAuth, 'X-Institutional-Session': institutionalSessionToken }
    const backendResponse = await fetch(`${backendUrl.replace(/\/$/, '')}/access-policy/labs/${labId}/eligibility?${new URLSearchParams(categories.map((category) => ['categories', category]))}`, { headers, cache: 'no-store' })
    const payload = await backendResponse.json().catch(() => ({ error: 'Eligibility service unavailable' }))
    return NextResponse.json(payload, { status: backendResponse.status })
  } catch (error) {
    if (error.name === 'UnauthorizedError' || error.name === 'ForbiddenError') return handleGuardError(error, request)
    return NextResponse.json({ error: 'Eligibility service unavailable' }, { status: 503 })
  }
}
