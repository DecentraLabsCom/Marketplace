"use client";
import React, { useEffect, useState } from 'react'
import PropTypes from 'prop-types'
import {
  safeExternalHttpsUrl,
} from '@/utils/security/safeUrl'

/**
 * AasPanel — shows Digital Twin (AAS) metadata for a lab resource in the Marketplace.
 *
 * Fetches the AAS shell and its published metadata from the provider's Gateway
 * via the Marketplace proxy at /api/aas/shell. Renders nothing if the provider
 * has not deployed the AAS profile (404 response) or if required props are missing.
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

    const params = new URLSearchParams({ labId: String(labId) })
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

  const { shell, nameplate, simulationInfo, operationalInfo, executionInfo } = state.data || {}
  if (!shell) return null

  const assetType = shell?.assetInformation?.assetType || 'Unknown'
  const submodelCount = Array.isArray(shell?.submodels) ? shell.submodels.length : 0

  // Build direct URL to the AASX package on the provider's gateway
  const aasxPackageUrl = (() => {
    try {
      // Route through the Marketplace proxy to avoid CORS issues on the download
      const params = new URLSearchParams({ labId: String(labId) })
      return `/api/aas/package?${params.toString()}`
    } catch {
      return null
    }
  })()

  const labType = nameplate?.LabType || assetType
  const hostName = nameplate?.HostName || null
  const networkAddress = nameplate?.NetworkAddress || null
  const mappedLabIds = nameplate?.MappedLabIds || null
  const displayAasId = shell?.id || `urn:decentralabs:lab:${labId}`

  // Shell-level description (optional, set during FMU sync)
  const shellDescription = shell?.description?.[0]?.text || null

  // Published licensing/documentation may come from SimulationModels (FMU) or
  // Nameplate (physical laboratory).
  // Physical-lab generators publish the same registered metadata in Nameplate;
  // FMU generators publish it in SimulationModels. Keep the presentation
  // resource-agnostic so both paths show the provider's documents and terms.
  const simLicense = simulationInfo?.license || nameplate?.License || null
  const simDocsUrls = [...new Set(
    (Array.isArray(simulationInfo?.documentationUrls) && simulationInfo.documentationUrls.length > 0
      ? simulationInfo.documentationUrls
      : [simulationInfo?.documentationUrl, ...Object.entries(nameplate || {})
        .filter(([key]) => /^documentationurl(?:_\d+)?$/i.test(key))
        .sort(([left], [right]) => left.localeCompare(right, undefined, { numeric: true }))
        .map(([, value]) => value)]
    ).map((url) => safeExternalHttpsUrl(url)).filter(Boolean),
  )]
  const contactEmail = simulationInfo?.contactEmail || nameplate?.ContactEmail || null
  const simContactEmail = typeof contactEmail === 'string'
    && contactEmail.length <= 320
    && /^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(contactEmail)
    ? contactEmail
    : null

  const formatFlag = (value) => {
    if (value === true) return 'Yes'
    if (value === false) return 'No'
    return 'Unknown'
  }

  const formatTimestamp = (value) => {
    if (!value) return 'Unknown'
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? value : date.toLocaleString()
  }

  // Route the raw shell through Marketplace so the browser gets the same
  // gateway resolution and cache policy as the panel data request.
  const aasShellViewUrl = (() => {
    try {
      const params = new URLSearchParams({ labId: String(labId), raw: 'true' })
      return `/api/aas/shell?${params.toString()}`
    } catch {
      return null
    }
  })()

  return (
    <div className="rounded-lg border border-[#2a2f33] bg-[#1f2426] p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-header-bg text-lg font-semibold">Digital Twin Metadata</h3>
        <div className="flex items-center gap-3">
          {aasShellViewUrl && (
            <a
              href={aasShellViewUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-brand hover:underline"
              aria-label="View raw AAS shell JSON through Marketplace proxy"
            >
              View AAS Shell ↗
            </a>
          )}
          {aasxPackageUrl && (
            <a
              href={aasxPackageUrl}
              download
              className="text-xs text-brand hover:underline"
              aria-label="Download AASX package through Marketplace proxy"
            >
              Download AASX ↓
            </a>
          )}
        </div>
      </div>

      <p className="text-xs text-text-secondary mb-3">
        Asset Administration Shell (IEC 63278 / IDS) — {submodelCount} submodel{submodelCount !== 1 ? 's' : ''} registered.
      </p>

      {shellDescription && (
        <p className="text-sm text-neutral-300 mb-3">{shellDescription}</p>
      )}

      <div className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <span className="text-text-secondary text-xs uppercase tracking-wide">Asset Type</span>
          <p className="text-neutral-200 font-medium">{labType}</p>
        </div>

        <div>
          <span className="text-text-secondary text-xs uppercase tracking-wide">AAS Identifier</span>
          <p className="text-neutral-200 font-mono text-xs truncate" title={displayAasId}>
            {displayAasId}
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

        {simLicense && (
          <div>
            <span className="text-text-secondary text-xs uppercase tracking-wide">License</span>
            <p className="text-neutral-200 font-medium">{simLicense}</p>
          </div>
        )}

        {simDocsUrls.length > 0 && (
          <div>
            <span className="text-text-secondary text-xs uppercase tracking-wide">Documentation</span>
            <div className="space-y-1">
              {simDocsUrls.map((url) => (
                <p key={url} className="text-neutral-200 font-medium truncate">
                  <a href={url} target="_blank" rel="noopener noreferrer" className="text-brand hover:underline">
                    {url}
                  </a>
                </p>
              ))}
            </div>
          </div>
        )}

        {simContactEmail && (
          <div className="col-span-2">
            <span className="text-text-secondary text-xs uppercase tracking-wide">Contact</span>
            <p className="text-neutral-200 font-medium">
              <a href={`mailto:${simContactEmail}`} className="text-brand hover:underline">
                {simContactEmail}
              </a>
            </p>
          </div>
        )}

        {executionInfo && (
          <div className="col-span-2 border-t border-[#2a2f33] pt-3 mt-1">
            <h4 className="text-text-secondary text-xs uppercase tracking-wide mb-2">Execution Capabilities</h4>
            <div className="grid grid-cols-2 gap-3">
              {executionInfo.executionClass && (
                <div>
                  <span className="text-text-secondary text-xs uppercase tracking-wide">Execution Class</span>
                  <p className="text-neutral-200 font-medium">{executionInfo.executionClass}</p>
                </div>
              )}
              {executionInfo.accessProtocol && (
                <div>
                  <span className="text-text-secondary text-xs uppercase tracking-wide">Access Protocol</span>
                  <p className="text-neutral-200 font-medium">{executionInfo.accessProtocol}</p>
                </div>
              )}
              {executionInfo.reservationRequired !== null && executionInfo.reservationRequired !== undefined && (
                <div>
                  <span className="text-text-secondary text-xs uppercase tracking-wide">Reservation Required</span>
                  <p className="text-neutral-200 font-medium">{formatFlag(executionInfo.reservationRequired)}</p>
                </div>
              )}
              {Array.isArray(executionInfo.operations) && executionInfo.operations.length > 0 && (
                <div className="col-span-2">
                  <span className="text-text-secondary text-xs uppercase tracking-wide">Described Operations</span>
                  <p className="text-neutral-200 font-medium">
                    {executionInfo.operations.map((operation) => operation.idShort).join(', ')}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {operationalInfo && (
          <div className="col-span-2 border-t border-[#2a2f33] pt-3 mt-1">
            <h4 className="text-text-secondary text-xs uppercase tracking-wide mb-2">Last known operational Status</h4>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <span className="text-text-secondary text-xs uppercase tracking-wide">Status</span>
                <p className="text-neutral-200 font-medium">{operationalInfo.status || 'Unknown'}</p>
              </div>
              {operationalInfo.backendMode && (
                <div>
                  <span className="text-text-secondary text-xs uppercase tracking-wide">Backend</span>
                  <p className="text-neutral-200 font-medium">{operationalInfo.backendMode}</p>
                </div>
              )}
              {operationalInfo.modelAvailable !== null && operationalInfo.modelAvailable !== undefined && (
                <div>
                  <span className="text-text-secondary text-xs uppercase tracking-wide">Model Available</span>
                  <p className="text-neutral-200 font-medium">{formatFlag(operationalInfo.modelAvailable)}</p>
                </div>
              )}
              {(operationalInfo.activeSessions !== null && operationalInfo.activeSessions !== undefined) && (
                <div>
                  <span className="text-text-secondary text-xs uppercase tracking-wide">Active Sessions</span>
                  <p className="text-neutral-200 font-medium">
                    {operationalInfo.activeSessions}
                    {operationalInfo.maxConcurrentSessions !== null && operationalInfo.maxConcurrentSessions !== undefined
                      ? ` / ${operationalInfo.maxConcurrentSessions}`
                      : ''}
                  </p>
                </div>
              )}
              {operationalInfo.lastHeartbeat && (
                <div>
                  <span className="text-text-secondary text-xs uppercase tracking-wide">Last Heartbeat</span>
                  <p className="text-neutral-200 font-medium">{formatTimestamp(operationalInfo.lastHeartbeat)}</p>
                </div>
              )}
              {operationalInfo.localModeEnabled !== null && operationalInfo.localModeEnabled !== undefined && (
                <div>
                  <span className="text-text-secondary text-xs uppercase tracking-wide">Local Mode</span>
                  <p className="text-neutral-200 font-medium">{formatFlag(operationalInfo.localModeEnabled)}</p>
                </div>
              )}
              {operationalInfo.localSessionActive !== null && operationalInfo.localSessionActive !== undefined && (
                <div>
                  <span className="text-text-secondary text-xs uppercase tracking-wide">Local Session</span>
                  <p className="text-neutral-200 font-medium">{formatFlag(operationalInfo.localSessionActive)}</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

AasPanel.propTypes = {
  labId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
  gatewayUrl: PropTypes.string.isRequired,
}
