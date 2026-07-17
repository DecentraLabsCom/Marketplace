"use client";
import React, { useState, useEffect, useCallback } from 'react'
import PropTypes from 'prop-types'
import devLog from '@/utils/dev/logger'
import { resolveGatewayFeatureError } from './gatewayErrors'

/**
 * SimulationHistory - shows a list of past simulation runs for a given lab.
 */
export default function SimulationHistory({ labId, reservationKey, gatewayUrl, gatewaySessionOrigin, onEnsureGatewaySession, onFetchGateway, onLoadResult }) {
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [historyUnavailable, setHistoryUnavailable] = useState(false)

  const fetchHistory = useCallback(async () => {
    if (!gatewayUrl || !labId) return
    setLoading(true)
    setError(null)
    setHistoryUnavailable(false)

    try {
      let gatewayOrigin = gatewaySessionOrigin
      if (!gatewayOrigin && onEnsureGatewaySession) {
        gatewayOrigin = await onEnsureGatewaySession()
      }
      if (!gatewayOrigin) {
        throw new Error('Authentication required to load simulation history')
      }

      const qs = new URLSearchParams({
        labId: String(labId),
        reservationKey: reservationKey ?? '',
        limit: '20',
        offset: '0',
      })
      const path = `/api/simulations/history?${qs.toString()}`
      const res = onFetchGateway
        ? await onFetchGateway(path, { credentials: 'include' })
        : await fetch(path, { credentials: 'include' })
      if (!res.ok) {
        let payload = {}
        try {
          payload = await res.json()
        } catch {
          payload = {}
        }
        const gatewayError = resolveGatewayFeatureError(res.status, payload, {
          fallbackMessage: `Failed to fetch history (${res.status})`,
          unavailableMessage: 'Simulation history is not available yet for this FMU backend.',
        })
        setHistoryUnavailable(gatewayError.unavailable)
        throw new Error(gatewayError.message)
      }
      const data = await res.json()
      setHistory(data.simulations || [])
    } catch (err) {
      devLog.error('History fetch error:', err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [gatewayUrl, labId, reservationKey, gatewaySessionOrigin, onEnsureGatewaySession, onFetchGateway])

  useEffect(() => {
    fetchHistory()
  }, [fetchHistory])

  if (loading) {
    return <p className="text-text-secondary text-sm">Loading history&hellip;</p>
  }

  if (error) {
    return (
      <div className="text-error-text text-sm">
        {error}
        {!historyUnavailable && (
          <button onClick={fetchHistory} className="ml-2 underline text-brand">Retry</button>
        )}
      </div>
    )
  }

  if (!history.length) {
    return <p className="text-text-secondary text-sm">No simulation history yet.</p>
  }

  return (
    <div>
      <h3 className="text-sm font-semibold text-header-bg mb-2">Simulation History</h3>
      <div className="max-h-48 overflow-auto rounded-lg border border-[#2a2f33]">
        <table className="w-full text-xs">
          <thead className="bg-[#181b1d] sticky top-0">
            <tr>
              <th className="text-left px-2 py-1.5 text-text-secondary">Date</th>
              <th className="text-left px-2 py-1.5 text-text-secondary">Type</th>
              <th className="text-left px-2 py-1.5 text-text-secondary">Time</th>
              <th className="text-left px-2 py-1.5 text-text-secondary">Status</th>
              <th className="px-2 py-1.5" />
            </tr>
          </thead>
          <tbody>
            {history.map((sim) => (
              <tr key={sim.id} className="border-t border-[#2a2f33] hover:bg-[#1f2426]">
                <td className="px-2 py-1 text-neutral-400">
                  {sim.created_at ? new Date(sim.created_at + 'Z').toLocaleString() : '-'}
                </td>
                <td className="px-2 py-1 text-neutral-300">{sim.fmi_type || '-'}</td>
                <td className="px-2 py-1 text-neutral-300">
                  {sim.elapsed_seconds != null ? `${sim.elapsed_seconds.toFixed(2)}s` : '-'}
                </td>
                <td className="px-2 py-1">
                  <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium ${
                    sim.status === 'completed'
                      ? 'bg-green-900/40 text-green-400'
                      : 'bg-red-900/40 text-red-400'
                  }`}>
                    {sim.status}
                  </span>
                </td>
                <td className="px-2 py-1 text-right">
                  {onLoadResult && (
                    <button
                      onClick={() => onLoadResult(sim.id)}
                      className="text-brand hover:underline text-[10px]"
                    >
                      Load
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

SimulationHistory.propTypes = {
  labId: PropTypes.string,
  reservationKey: PropTypes.string,
  gatewayUrl: PropTypes.string,
  gatewaySessionOrigin: PropTypes.string,
  onEnsureGatewaySession: PropTypes.func,
  onFetchGateway: PropTypes.func,
  onLoadResult: PropTypes.func,
}

