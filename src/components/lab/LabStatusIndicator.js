import React from 'react'
import PropTypes from 'prop-types'

const joinClasses = (...values) => values.flat().filter(Boolean).join(' ')

const STATUS_PRESENTATIONS = {
  ready: {
    label: 'Ready',
    description: 'This laboratory is available for use.',
    dot: 'bg-emerald-400 shadow-[0_0_8px_2px_rgb(52_211_153_/_0.75)]',
    animation: 'animate-status-glow',
  },
  reachable: {
    label: 'Reachable',
    description: 'This laboratory is online and available.',
    dot: 'bg-emerald-400 shadow-[0_0_8px_2px_rgb(52_211_153_/_0.75)]',
    animation: 'animate-status-glow',
  },
  busyWarning: {
    label: 'Busy',
    description: 'Another user is currently using this laboratory.',
    dot: 'bg-orange-400 shadow-[0_0_8px_2px_rgb(251_146_60_/_0.75)]',
    animation: 'animate-status-pulse',
  },
  busyCritical: {
    label: 'Busy',
    description: 'This laboratory is temporarily unavailable for remote use.',
    dot: 'bg-red-500 shadow-[0_0_8px_2px_rgb(239_68_68_/_0.8)]',
    animation: 'animate-status-pulse',
  },
  not_ready: {
    label: 'Not ready',
    description: 'This laboratory is not ready for use yet.',
    dot: 'bg-red-500 shadow-[0_0_8px_2px_rgb(239_68_68_/_0.75)]',
    animation: 'animate-status-glow',
  },
  targetUnreachable: {
    label: 'Unreachable',
    description: 'This laboratory is currently unavailable.',
    dot: 'bg-red-500 shadow-[0_0_8px_2px_rgb(239_68_68_/_0.75)]',
    animation: 'animate-status-glow',
  },
  unknown: {
    label: 'Unknown',
    description: 'The availability of this laboratory cannot be confirmed right now.',
    dot: 'bg-amber-400 shadow-[0_0_8px_2px_rgb(251_191_36_/_0.75)]',
    animation: 'animate-status-glow',
  },
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
  const tooltip = compact
    ? `${presentation.label}${ageLabel ? `: ${ageLabel}` : ''}.`
    : `${presentation.label}: ${presentation.description}${ageLabel ? ` Updated ${ageLabel}.` : ''}`
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
            <span className="mt-1 block text-white/60">
              {ageLabel ? `Updated ${ageLabel}.` : 'Availability is being checked.'}
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
