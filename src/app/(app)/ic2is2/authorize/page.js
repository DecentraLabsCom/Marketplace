'use client'

import { useState } from 'react'

const AUTHORIZE_PATH = '/api/ic2is2/device/authorize'

function authorizationError(response, payload, fallback) {
  if (response.status === 401 && payload.code === 'IC2IS2_AUTHORIZATION_FAILED') {
    return 'Open the matching reservation in this browser, then try again.'
  }
  if (response.status === 401) return 'Sign in to Marketplace, then try again.'
  return payload.error || fallback
}

function formatUserCode(value) {
  const normalized = String(value || '').toUpperCase().replace(/[\s-]/g, '').slice(0, 8)
  return normalized.length > 4 ? `${normalized.slice(0, 4)}-${normalized.slice(4)}` : normalized
}

function displayReservationKey(value) {
  const key = String(value || '')
  if (key.length <= 18) return key
  return `${key.slice(0, 10)}…${key.slice(-6)}`
}

export default function Ic2is2AuthorizationPage() {
  const [userCode, setUserCode] = useState('')
  const [request, setRequest] = useState(null)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [decision, setDecision] = useState(null)

  async function lookup(event) {
    event.preventDefault()
    setBusy(true)
    setMessage('')
    setRequest(null)
    setDecision(null)
    try {
      const response = await fetch(AUTHORIZE_PATH, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        credentials: 'same-origin',
        body: JSON.stringify({ userCode, action: 'preview' }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(authorizationError(response, payload, 'This code could not be verified.'))
      setRequest(payload)
    } catch (error) {
      setMessage(error.message)
    } finally {
      setBusy(false)
    }
  }

  async function decide(action) {
    setBusy(true)
    setMessage('')
    try {
      const response = await fetch(AUTHORIZE_PATH, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        cache: 'no-store',
        body: JSON.stringify({ userCode, action }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(authorizationError(response, payload, 'The IC2IS2 request could not be completed.'))
      setDecision(action)
      setRequest(null)
    } catch (error) {
      setMessage(error.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="mx-auto max-w-2xl px-5 py-12">
      <h1 className="text-3xl font-semibold text-slate-900">Authorize an IC2IS2 experiment</h1>
      <p className="mt-3 text-slate-700">
        Enter the code shown by the IC2IS2 process you started to review the access it is requesting.
      </p>
      <p className="mt-2 text-sm text-slate-600">
        Open the matching reservation in this browser before approving. You can deny a request without opening the reservation.
      </p>

      {!decision && !request && (
        <form onSubmit={lookup} className="mt-8 space-y-4">
          <label htmlFor="ic2is2-user-code" className="block text-sm font-medium text-slate-800">
            IC2IS2 code
          </label>
          <input
            id="ic2is2-user-code"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck="false"
            maxLength={9}
            value={userCode}
            onChange={(event) => setUserCode(formatUserCode(event.target.value))}
            placeholder="ABCD-EFGH"
            className="w-full rounded-lg border border-slate-300 px-4 py-3 font-mono text-lg tracking-widest text-slate-900"
          />
          <div className="flex flex-wrap gap-3">
            <button
              type="submit"
              disabled={busy || userCode.replace('-', '').length !== 8}
              className="rounded-lg bg-slate-900 px-5 py-3 font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? 'Checking…' : 'Review request'}
            </button>
            <button
              type="button"
              disabled={busy || userCode.replace('-', '').length !== 8}
              onClick={() => decide('deny')}
              className="rounded-lg border border-slate-300 px-5 py-3 font-medium text-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Deny request
            </button>
          </div>
        </form>
      )}

      {request && !decision && (
        <section className="mt-8 rounded-xl border border-amber-300 bg-amber-50 p-5" aria-live="polite">
          <h2 className="text-lg font-semibold text-slate-900">{request.label}</h2>
          <dl className="mt-4 grid gap-3 text-sm text-slate-800">
            <div><dt className="font-medium">Lab</dt><dd>{request.labId}</dd></div>
            <div><dt className="font-medium">Reservation</dt><dd className="break-all font-mono">{displayReservationKey(request.reservationKey)}</dd></div>
          </dl>
          <p className="mt-4 text-sm text-slate-700">
            {request.description}
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <button type="button" disabled={busy} onClick={() => decide('approve')} className="rounded-lg bg-slate-900 px-5 py-3 font-medium text-white disabled:opacity-50">
              {busy ? 'Approving…' : 'Approve IC2IS2'}
            </button>
            <button type="button" disabled={busy} onClick={() => decide('deny')} className="rounded-lg border border-slate-300 px-5 py-3 font-medium text-slate-800 disabled:opacity-50">
              Deny request
            </button>
          </div>
        </section>
      )}

      {decision && (
        <p className={`mt-8 rounded-xl border p-5 ${decision === 'approve' ? 'border-emerald-300 bg-emerald-50 text-emerald-900' : 'border-slate-300 bg-slate-50 text-slate-800'}`} aria-live="polite">
          {decision === 'approve'
            ? 'Approved. Return to IC2IS2 to continue the experiment.'
            : 'Request denied.'}
        </p>
      )}
      {message && <p className="mt-5 rounded-lg bg-red-50 p-4 text-sm text-red-800" role="alert">{message}</p>}
    </main>
  )
}
