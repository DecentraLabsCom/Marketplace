import React from 'react'
import PropTypes from 'prop-types'

const joinClasses = (...values) => values.flat().filter(Boolean).join(' ')

const STATUS_PRESENTATIONS = {
  ready: {
    label: 'Ready',
    detailLabel: 'Available',
    description: 'This laboratory is available for use.',
    compactDescription: 'Available now',
    dot: 'bg-emerald-400 status-led',
    ledColor: '52 211 153',
    animation: 'animate-status-glow',
  },
  reachable: {
    label: 'Reachable',
    detailLabel: 'Available',
    description: 'This laboratory is available now.',
    compactDescription: 'Available now',
    dot: 'bg-emerald-400 status-led',
    ledColor: '52 211 153',
    animation: 'animate-status-glow',
  },
  availableOnDemand: {
    label: 'Available on demand',
    detailLabel: 'Available when needed',
    description: 'This laboratory can be made available when needed.',
    compactDescription: 'Can be woken on demand',
    dot: 'bg-emerald-400 status-led',
    ledColor: '52 211 153',
    animation: 'animate-status-pulse',
  },
  recoverable: {
    label: 'Recoverable',
    detailLabel: 'May be available',
    description: 'This laboratory may become available after a short wait.',
    compactDescription: 'Wake configured',
    dot: 'bg-orange-400 status-led',
    ledColor: '251 146 60',
    animation: 'animate-status-glow',
  },
  wakeFailed: {
    label: 'Wake failed',
    detailLabel: 'Unavailable',
    description: 'This laboratory is currently unavailable.',
    compactDescription: 'Recovery failed',
    dot: 'bg-red-500 status-led',
    ledColor: '239 68 68',
    animation: 'animate-status-glow',
  },
  busyWarning: {
    label: 'Busy',
    detailLabel: 'In use',
    description: 'This laboratory is currently in use.',
    compactDescription: 'In use',
    dot: 'bg-orange-400 status-led',
    ledColor: '251 146 60',
    animation: 'animate-status-pulse',
  },
  fmuBusyWarning: {
    label: 'FMU busy',
    detailLabel: 'In use',
    description: 'Simulations are currently in use.',
    compactDescription: 'At capacity',
    dot: 'bg-orange-400 status-led',
    ledColor: '251 146 60',
    animation: 'animate-status-pulse',
  },
  busyCritical: {
    label: 'Busy',
    detailLabel: 'Unavailable',
    description: 'This laboratory is currently unavailable.',
    compactDescription: 'Unavailable',
    dot: 'bg-red-500 status-led',
    ledColor: '239 68 68',
    animation: 'animate-status-pulse',
  },
  not_ready: {
    label: 'Not ready',
    detailLabel: 'Unavailable',
    description: 'This laboratory is not currently available.',
    compactDescription: 'Not available',
    dot: 'bg-red-500 status-led',
    ledColor: '239 68 68',
    animation: 'animate-status-glow',
  },
  targetUnreachable: {
    label: 'Unreachable',
    detailLabel: 'Unavailable',
    description: 'This laboratory is currently unavailable.',
    compactDescription: 'Unavailable',
    dot: 'bg-red-500 status-led',
    ledColor: '239 68 68',
    animation: 'animate-status-glow',
  },
  unknown: {
    label: 'Unknown',
    detailLabel: 'Availability unknown',
    description: 'The availability of this laboratory cannot be confirmed right now.',
    compactDescription: 'Not confirmed',
    dot: 'bg-amber-400 status-led',
    ledColor: '251 191 36',
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

const isFmuStatus = (status = {}) => (
  status?.resourceType === 'fmu'
  || status?.source === 'fmu_runner_health'
  || String(status?.reason || '').startsWith('fmu_')
)

export const getLabStatusPresentation = (status = {}) => {
  const state = ['ready', 'reachable', 'busy', 'not_ready', 'unknown'].includes(status?.state)
    ? status.state
    : 'unknown'
  if (isFmuStatus(status)) {
    if (state === 'busy') return STATUS_PRESENTATIONS.fmuBusyWarning
    if (state === 'ready' || state === 'reachable') return STATUS_PRESENTATIONS[state]
    return STATUS_PRESENTATIONS[state === 'not_ready' ? 'not_ready' : 'unknown']
  }
  if (state === 'not_ready' && status?.source === 'guacamole_tcp_probe') {
    return STATUS_PRESENTATIONS.targetUnreachable
  }
  if (state === 'busy') {
    if (isFmuStatus(status)) return STATUS_PRESENTATIONS.fmuBusyWarning
    return status?.severity === 'critical'
      ? STATUS_PRESENTATIONS.busyCritical
      : STATUS_PRESENTATIONS.busyWarning
  }
  if (state === 'ready' || state === 'reachable') {
    return STATUS_PRESENTATIONS[state]
  }
  const wakeState = typeof status?.wake === 'string' ? status.wake : status?.wake?.state
  const availability = status?.availability
  if (availability === 'on_demand' || (wakeState === 'verified' && state !== 'ready' && state !== 'reachable')) {
    return STATUS_PRESENTATIONS.availableOnDemand
  }
  if (availability === 'recoverable' || wakeState === 'configured') {
    return STATUS_PRESENTATIONS.recoverable
  }
  if (wakeState === 'failed' && state !== 'ready' && state !== 'reachable') {
    return STATUS_PRESENTATIONS.wakeFailed
  }
  return STATUS_PRESENTATIONS[state]
}

const userFacingDescription = (status, presentation) => {
  if (!isFmuStatus(status)) return presentation.description
  if (status?.state === 'ready' || status?.state === 'reachable') return 'Simulations are available now.'
  if (status?.state === 'busy') return 'Simulations are currently in use.'
  if (status?.state === 'not_ready') return 'Simulations are not currently available.'
  return 'Simulation availability cannot be confirmed right now.'
}

const compactStatusDescription = (status, presentation) => {
  if (isFmuStatus(status)) {
    if (status?.state === 'busy') return 'At capacity'
    if (status?.state === 'ready' || status?.state === 'reachable') return 'Execution ready'
    if (status?.state === 'not_ready') return 'Executor unavailable'
    return 'Not confirmed'
  }
  return presentation.compactDescription
}

export default function LabStatusIndicator({
  status = null,
  className = '',
  compact = false,
  tooltipAlign = 'center',
  tooltipPlacement = 'below',
}) {
  const presentation = getLabStatusPresentation(status)
  const fmu = isFmuStatus(status)
  const ageLabel = formatAge(status?.ageSeconds)
  const compactDescription = compactStatusDescription(status, presentation)
  const detailLabel = presentation.detailLabel || presentation.label
  const description = userFacingDescription(status, presentation)
  const tooltip = compact
    ? `${presentation.label}. ${compactDescription}.`
    : `${detailLabel}: ${description}${ageLabel ? ` Updated ${ageLabel}.` : ''}`
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
        data-availability={status?.availability || 'unknown'}
        data-wake={fmu ? 'not_applicable' : typeof status?.wake === 'string' ? status.wake : status?.wake?.state || 'unknown'}
        data-executor={fmu ? status?.executor?.state || 'unknown' : 'not_applicable'}
        data-capacity={fmu ? status?.capacity?.state || 'unknown' : 'not_applicable'}
        data-status={status?.state || 'unknown'}
        data-testid="lab-status-indicator"
        role="img"
        tabIndex="0"
        title={tooltip}
      >
        <span
          aria-hidden="true"
          className={joinClasses('size-3 rounded-full', presentation.dot, presentation.animation)}
          style={{ '--status-led-color': presentation.ledColor }}
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
            <span className="mt-1 block text-white/80">{compactDescription}.</span>
          </>
        ) : (
          <>
            <span className="block font-semibold">{detailLabel}</span>
            <span className="mt-1 block text-white/80">{description}</span>
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
    resourceType: PropTypes.oneOf(['lab', 'fmu']),
    state: PropTypes.oneOf(['ready', 'reachable', 'busy', 'not_ready', 'unknown']),
    reason: PropTypes.string,
    source: PropTypes.oneOf([
      'lab_station_heartbeat',
      'guacamole_tcp_probe',
      'fmu_runner_health',
      'status_unavailable',
    ]),
    severity: PropTypes.oneOf(['positive', 'warning', 'critical', 'neutral']),
    ageSeconds: PropTypes.number,
    access: PropTypes.oneOf(['ready', 'busy', 'inaccessible', 'unknown']),
    wake: PropTypes.oneOfType([
      PropTypes.oneOf(['verified', 'configured', 'failed', 'unknown']),
      PropTypes.shape({
        state: PropTypes.oneOf(['verified', 'configured', 'failed', 'unknown']),
        ageSeconds: PropTypes.number,
      }),
    ]),
    availability: PropTypes.oneOf(['now', 'on_demand', 'recoverable', 'unavailable', 'unknown']),
    executor: PropTypes.shape({
      state: PropTypes.oneOf(['ready', 'not_ready', 'unknown']),
      ageSeconds: PropTypes.number,
    }),
    capacity: PropTypes.shape({
      state: PropTypes.oneOf(['available', 'busy', 'unknown']),
      active: PropTypes.number,
      maximum: PropTypes.number,
      available: PropTypes.number,
      ageSeconds: PropTypes.number,
    }),
  }),
  className: PropTypes.string,
  compact: PropTypes.bool,
  tooltipAlign: PropTypes.oneOf(['center', 'start']),
  tooltipPlacement: PropTypes.oneOf(['above', 'below']),
}
