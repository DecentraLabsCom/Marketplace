"use client"

import { useState } from 'react'
import PropTypes from 'prop-types'
import Modal from '@/components/ui/Modal'

const INITIAL_FORM = { origin: '', owner: '', reason: '' }

const formatTimestamp = (value) => {
  if (!value) return 'Not available'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'Not available' : date.toLocaleString()
}

export default function MetadataOriginExceptionsPanel({ onError }) {
  const [isOpen, setIsOpen] = useState(false)
  const [exceptions, setExceptions] = useState([])
  const [form, setForm] = useState(INITIAL_FORM)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [removalTarget, setRemovalTarget] = useState(null)

  const load = async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/admin/metadata-origin-exceptions', {
        method: 'GET',
        credentials: 'include',
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data?.error || 'Metadata exceptions are unavailable')
      setExceptions(Array.isArray(data?.exceptions) ? data.exceptions : [])
    } catch (error) {
      onError(error?.message || 'Metadata exceptions are unavailable')
    } finally {
      setLoading(false)
    }
  }

  const toggle = () => {
    if (!isOpen) load()
    setIsOpen((current) => !current)
  }

  const update = (field) => (event) => {
    setForm((current) => ({ ...current, [field]: event.target.value }))
  }

  const addException = async (event) => {
    event.preventDefault()
    setSaving(true)
    try {
      const response = await fetch('/api/admin/metadata-origin-exceptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          origin: form.origin.trim(),
          owner: form.owner.trim(),
          reason: form.reason.trim(),
        }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data?.error || 'Metadata exception could not be saved')
      setForm(INITIAL_FORM)
      await load()
    } catch (error) {
      onError(error?.message || 'Metadata exception could not be saved')
    } finally {
      setSaving(false)
    }
  }

  const removeException = async () => {
    if (!removalTarget) return
    setSaving(true)
    try {
      const response = await fetch('/api/admin/metadata-origin-exceptions', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ origin: removalTarget.origin }),
      })
      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data?.error || 'Metadata exception could not be revoked')
      }
      setRemovalTarget(null)
      await load()
    } catch (error) {
      onError(error?.message || 'Metadata exception could not be revoked')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="mt-8 border-t border-gray-200 pt-5" aria-labelledby="metadata-exceptions-heading">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="metadata-exceptions-heading" className="text-xl font-bold text-gray-900">Global metadata trust exceptions</h2>
          <p className="mt-1 text-sm text-gray-600">Use only for reviewed shared or external infrastructure. Provider backends registered on-chain do not belong here.</p>
        </div>
        <button
          type="button"
          onClick={toggle}
          className="rounded border border-gray-400 px-3 py-1.5 text-sm font-semibold text-gray-700 hover:bg-gray-50"
        >
          {isOpen ? 'Hide exceptions' : 'Manage exceptions'}
        </button>
      </div>

      {isOpen && (
        <div className="mt-4 space-y-5">
          <p className="rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
            An exception can serve metadata for any laboratory. It must be an exact HTTPS origin and include a named owner and review reason.
          </p>
          <form onSubmit={addException} className="grid gap-3 rounded border border-gray-200 p-4 md:grid-cols-2">
            <label className="text-sm font-semibold text-gray-700 md:col-span-2">
              Exact HTTPS origin
              <input className="mt-1 w-full rounded border p-2 font-mono text-sm" value={form.origin} onChange={update('origin')} placeholder="https://research-cdn.example.edu" required />
            </label>
            <label className="text-sm font-semibold text-gray-700">
              Owner
              <input className="mt-1 w-full rounded border p-2 text-sm" value={form.owner} onChange={update('owner')} placeholder="Research infrastructure team" required />
            </label>
            <label className="text-sm font-semibold text-gray-700">
              Review reason
              <input className="mt-1 w-full rounded border p-2 text-sm" value={form.reason} onChange={update('reason')} placeholder="Shared metadata CDN" required />
            </label>
            <div className="md:col-span-2">
              <button type="submit" disabled={saving} className="rounded bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-hover-dark disabled:cursor-not-allowed disabled:opacity-60">
                {saving ? 'Saving...' : 'Add reviewed exception'}
              </button>
            </div>
          </form>

          {loading ? <p className="text-sm text-gray-600">Loading exceptions...</p> : null}
          {!loading && exceptions.length === 0 ? <p className="text-sm text-gray-600">No dynamic global metadata exceptions are active.</p> : null}
          {exceptions.length > 0 && (
            <ul className="space-y-3">
              {exceptions.map((exception) => (
                <li key={exception.origin} className="rounded border border-gray-200 p-3 text-sm">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="break-all font-mono text-xs font-semibold text-gray-900">{exception.origin}</p>
                      <p className="mt-1"><strong>Owner:</strong> {exception.owner}</p>
                      <p><strong>Reason:</strong> {exception.reason}</p>
                      <p className="text-xs text-gray-600">Created: {formatTimestamp(exception.createdAt)}</p>
                    </div>
                    <button type="button" onClick={() => setRemovalTarget(exception)} className="rounded border border-red-700 px-3 py-1.5 text-xs font-semibold text-red-800 hover:bg-red-50">
                      Revoke exception
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <Modal
        isOpen={Boolean(removalTarget)}
        onClose={() => !saving && setRemovalTarget(null)}
        title="Revoke metadata trust exception?"
        size="md"
      >
        <div className="space-y-4 text-sm text-gray-700">
          <p>
            This immediately prevents <strong>{removalTarget?.origin}</strong> from being trusted as a global metadata exception. Labs using it may no longer load metadata or declared media.
          </p>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button type="button" disabled={saving} onClick={() => setRemovalTarget(null)} className="rounded border border-gray-300 px-4 py-2 font-semibold hover:bg-gray-50">Keep exception</button>
            <button type="button" disabled={saving} onClick={removeException} className="rounded bg-red-700 px-4 py-2 font-semibold text-white hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-60">
              {saving ? 'Revoking...' : 'Revoke exception'}
            </button>
          </div>
        </div>
      </Modal>
    </section>
  )
}

MetadataOriginExceptionsPanel.propTypes = {
  onError: PropTypes.func.isRequired,
}
