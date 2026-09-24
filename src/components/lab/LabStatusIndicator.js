import React from 'react'
import PropTypes from 'prop-types'

const joinClasses = (...values) => values.flat().filter(Boolean).join(' ')

const STATUS_PRESENTATIONS = {
  ready: {
    label: 'Ready',
    description: 'The latest Lab Station heartbeat reports that remote access is ready.',
    dot: 'bg-emerald-400 shadow-[0_0_8px_2px_rgb(52_211_153_/_0.75)]',
    animation: 'animate-status-glow',
  },
  reachable: {
    label: 'Reachable',
    description: 'The Gateway can open the configured RDP, VNC, or SSH service. This does not independently verify Lab Station or application readiness.',
    dot: 'bg-emerald-400 shadow-[0_0_8px_2px_rgb(52_211_153_/_0.75)]',
    animation: 'animate-status-glow',
  },
  busyWarning: {
    label: 'Busy',
    description: 'The station is alive, but a local session is currently active.',
    dot: 'bg-orange-400 shadow-[0_0_8px_2px_rgb(251_146_60_/_0.75)]',
    animation: 'animate-status-pulse',
  },
  busyCritical: {
    label: 'Busy',
    description: 'The station is alive, but local mode is blocking remote access.',
    dot: 'bg-red-500 shadow-[0_0_8px_2px_rgb(239_68_68_/_0.8)]',
    animation: 'animate-status-pulse',
  },
  not_ready: {
    label: 'Not ready',
    description: 'The latest fresh heartbeat reports that the station is not ready.',
    dot: 'bg-red-500 shadow-[0_0_8px_2px_rgb(239_68_68_/_0.75)]',
    animation: 'animate-status-glow',
  },
  targetUnreachable: {
    label: 'Unreachable',
    description: 'The Gateway could not open the configured RDP, VNC, or SSH service.',
    dot: 'bg-red-500 shadow-[0_0_8px_2px_rgb(239_68_68_/_0.75)]',
    animation: 'animate-status-glow',
  },
  unknown: {
    label: 'Unknown',
    description: 'No sufficiently fresh operational signal is available.',
    dot: 'bg-amber-400 shadow-[0_0_8px_2px_rgb(251_191_36_/_0.75)]',
    animation: 'animate-status-glow',
  },
}

const REASON_LABELS = {
  station_ready: 'station ready',
  fmu_ready: 'FMU executor ready',
  fmu_not_ready: 'FMU executor is not ready',
  local_session_active: 'local session active',
  local_mode_enabled: 'local mode enabled',
  station_not_ready: 'station reports not ready',
  heartbeat_stale: 'heartbeat is stale',
  heartbeat_missing: 'no heartbeat has been received',
  heartbeat_invalid: 'heartbeat timestamp is invalid',
  target_reachable: 'configured TCP service is reachable',
  target_unreachable: 'configured TCP service is unreachable',
  target_invalid: 'configured target is invalid',
  target_probe_error: 'TCP probe failed unexpectedly',
  lab_not_mapped: 'no station mapping is available',
  gateway_unavailable: 'Gateway status is unavailable',
  status_unavailable: 'status is temporarily unavailable',
}

const formatAge = (ageSeconds) => {
  const age = Number(ageSeconds)
  if (!Number.isFinite(age) || age < 0) return null
  if (age < 60) return `${Math.round(age)}s ago`
  if (age < 3600) return `${Math.floor(age / 60)}m ago`
  return `${Math.floor(age / 3600)}h ago`
}

export const getLabStatusPresentation = (status = {}) => {
  const state = ['ready', 'reachable', 'busy', 'not_ready', 'unknown'].includes(status?.state)
    ? status.state
    : 'unknown'
  if (state === 'not_ready' && status?.source === 'guacamole_tcp_probe') {
    return STATUS_PRESENTATIONS.targetUnreachable
  }
  if (state === 'busy') {
    return status?.severity === 'critical'
      ? STATUS_PRESENTATIONS.busyCritical
      : STATUS_PRESENTATIONS.busyWarning
  }
  return STATUS_PRESENTATIONS[state]
}

export default function LabStatusIndicator({
  status = null,
  className = '',
  compact = false,
  tooltipAlign = 'center',
  tooltipPlacement = 'below',
}) {
  const presentation = getLabStatusPresentation(status)
  const ageLabel = formatAge(status?.ageSeconds)
  const reasonLabel = REASON_LABELS[status?.reason] || 'latest Gateway signal'
  const tooltip = compact
    ? `${presentation.label}${ageLabel ? `: ${ageLabel}` : ''}.`
    : `${presentation.label}: ${presentation.description} Signal: ${reasonLabel}.${ageLabel ? ` Last signal ${ageLabel}.` : ''}`
  const tooltipAlignment = tooltipAlign === 'start'
    ? 'left-0 translate-x-0'
    : 'left-1/2 -translate-x-1/2'
  const tooltipWidth = compact ? 'w-40' : 'w-64'
  const tooltipPosition = tooltipPlacement === 'above'
    ? 'bottom-full mb-2'
    : 'top-full mt-2'

  return (
    <span className={joinClasses('group/status relative z-30 inline-flex', className)}>
      <span
        aria-label={tooltip}
        className="inline-flex size-7 cursor-help items-center justify-center"
        data-status={status?.state || 'unknown'}
        data-testid="lab-status-indicator"
        role="img"
        tabIndex="0"
        title={tooltip}
      >
        <span
          aria-hidden="true"
          className={joinClasses('size-3 rounded-full', presentation.dot, presentation.animation)}
        />
      </span>
      <span
        aria-hidden="true"
        className={joinClasses('pointer-events-none absolute rounded-md border border-white/15 bg-[#15191c]/95 px-3 py-2 text-left text-xs leading-4 text-white opacity-0 shadow-xl transition-opacity duration-150 group-hover/status:opacity-100 group-focus-within/status:opacity-100', tooltipAlignment, tooltipWidth, tooltipPosition)}
        data-testid="lab-status-tooltip"
      >
        {compact ? (
          <>
            <span className="block font-semibold">{presentation.label}</span>
            {ageLabel && <span className="mt-1 block text-white/60">{ageLabel}</span>}
          </>
        ) : (
          <>
            <span className="block font-semibold">{presentation.label}</span>
            <span className="mt-1 block text-white/80">{presentation.description}</span>
            <span className="mt-1 block text-white/70">Reason: {reasonLabel}.</span>
            <span className="mt-1 block text-white/60">
              {ageLabel ? `Last signal ${ageLabel}.` : 'No fresh signal.'}
            </span>
          </>
        )}
      </span>
    </span>
  )
}

LabStatusIndicator.propTypes = {
  status: PropTypes.shape({
    state: PropTypes.oneOf(['ready', 'reachable', 'busy', 'not_ready', 'unknown']),
    reason: PropTypes.string,
    source: PropTypes.oneOf(['lab_station_heartbeat', 'guacamole_tcp_probe', 'status_unavailable']),
    severity: PropTypes.oneOf(['positive', 'warning', 'critical', 'neutral']),
    ageSeconds: PropTypes.number,
  }),
  className: PropTypes.string,
  compact: PropTypes.bool,
  tooltipAlign: PropTypes.oneOf(['center', 'start']),
  tooltipPlacement: PropTypes.oneOf(['above', 'below']),
}
