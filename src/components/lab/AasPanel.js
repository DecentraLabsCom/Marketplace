"use client";
import React, { useEffect, useState } from 'react'
import PropTypes from 'prop-types'

/**
 * AasPanel — shows Digital Twin (AAS) metadata for a lab resource in the Marketplace.
 *
 * Fetches the AAS shell and Nameplate submodel from the provider's Gateway via the
 * Marketplace proxy at /api/aas/shell. Renders nothing if the provider has not
 * deployed the AAS profile (404 response) or if required props are missing.
 *
 * @param {Object} props
 * @param {string|number} props.labId      - Lab ID (used to build the AAS identifier)
 * @param {string}        props.gatewayUrl - Provider Gateway base URL (accessURI from contract)
 */
export default function AasPanel({ labId, gatewayUrl }) {
  const [state, setState] = useState({ loading: true, data: null, error: null })

  useEffect(() => {
    if (!labId || !gatewayUrl) {
      setState({ loading: false, data: null, error: null })
      return
    }

    let cancelled = false
    setState({ loading: true, data: null, error: null })

    const params = new URLSearchParams({ labId: String(labId), gatewayUrl })
    fetch(`/api/aas/shell?${params.toString()}`, { cache: 'no-store' })
      .then(async (res) => {
        if (cancelled) return
        if (res.status === 404) {
          setState({ loading: false, data: null, error: null })
          return
        }
        const body = await res.json()
        if (!res.ok) {
          setState({ loading: false, data: null, error: body?.error || `HTTP ${res.status}` })
          return
        }
        setState({ loading: false, data: body, error: null })
      })
      .catch((err) => {
        if (!cancelled) {
          setState({ loading: false, data: null, error: err.message || 'Request failed' })
        }
      })

    return () => { cancelled = true }
  }, [labId, gatewayUrl])

  // Don't render anything if props are missing, data not found, or still loading
  if (!labId || !gatewayUrl || state.loading || (!state.data && !state.error)) return null

  // Silently omit on fetch errors — non-critical feature
  if (state.error) return null

  const { shell, nameplate } = state.data || {}
  if (!shell) return null

  const assetType = shell?.assetInformation?.assetType || 'Unknown'
  const submodelCount = Array.isArray(shell?.submodels) ? shell.submodels.length : 0

  // Build direct URL to the AASX package on the provider's gateway
  const aasxPackageUrl = (() => {
    try {
      // Route through the Marketplace proxy to avoid CORS issues on the download
      const params = new URLSearchParams({ labId: String(labId), gatewayUrl })
      return `/api/aas/package?${params.toString()}`
    } catch {
      return null
    }
  })()

  const labType = nameplate?.LabType || assetType
  const hostName = nameplate?.HostName || null
  const networkAddress = nameplate?.NetworkAddress || null
  const mappedLabIds = nameplate?.MappedLabIds || null
  const syncTimestamp = nameplate?.SyncTimestamp || null

  // Build a direct link to the raw AAS JSON on the provider's gateway
  const aasShellViewUrl = (() => {
    try {
      const base = new URL(gatewayUrl)
      const origin = `${base.protocol}//${base.host}`
      const basePath = base.pathname.replace(/\/+$/, '').replace(/\/auth$/, '')
      const aasId = `urn:decentralabs:lab:${labId}`
      const encodedId = btoa(aasId).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
      return `${origin}${basePath}/aas/shells/${encodedId}`
    } catch {
      return null
    }
  })()

  return (
    <div className="mt-4 rounded-lg border border-[#2a2f33] bg-[#1f2426] p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-header-bg text-lg font-semibold">Digital Twin Metadata</h3>
        <div className="flex items-center gap-3">
          {aasShellViewUrl && (
            <a
              href={aasShellViewUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-brand hover:underline"
              aria-label="View raw AAS shell JSON on provider gateway"
            >
              View AAS Shell ↗
            </a>
          )}
          {aasxPackageUrl && (
            <a
              href={aasxPackageUrl}
              download
              className="text-xs text-brand hover:underline"
              aria-label="Download AASX package from provider gateway"
            >
              Download AASX ↓
            </a>
          )}
        </div>
      </div>

      <p className="text-xs text-text-secondary mb-3">
        Asset Administration Shell (IEC 63278 / IDS) — {submodelCount} submodel{submodelCount !== 1 ? 's' : ''} registered.
      </p>

      <div className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <span className="text-text-secondary text-xs uppercase tracking-wide">Asset Type</span>
          <p className="text-neutral-200 font-medium">{labType}</p>
        </div>

        <div>
          <span className="text-text-secondary text-xs uppercase tracking-wide">AAS Identifier</span>
          <p className="text-neutral-200 font-mono text-xs truncate" title={`urn:decentralabs:lab:${labId}`}>
            urn:decentralabs:lab:{labId}
          </p>
        </div>

        {hostName && (
          <div>
            <span className="text-text-secondary text-xs uppercase tracking-wide">Host</span>
            <p className="text-neutral-200 font-medium">{hostName}</p>
          </div>
        )}

        {networkAddress && (
          <div>
            <span className="text-text-secondary text-xs uppercase tracking-wide">Network Address</span>
            <p className="text-neutral-200 font-medium">{networkAddress}</p>
          </div>
        )}

        {mappedLabIds && (
          <div className="col-span-2">
            <span className="text-text-secondary text-xs uppercase tracking-wide">Mapped Lab IDs</span>
            <p className="text-neutral-200 font-medium">{mappedLabIds}</p>
          </div>
        )}
      </div>

      {syncTimestamp && (
        <p className="mt-3 text-xs text-text-secondary">
          Last synced: {new Date(syncTimestamp).toLocaleString()}
        </p>
      )}
    </div>
  )
}

AasPanel.propTypes = {
  labId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
  gatewayUrl: PropTypes.string.isRequired,
}
