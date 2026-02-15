/**
 * Stake Health Indicator component
 * Visual badge showing whether a provider's stake is sufficient, at risk, or insufficient
 */
import React, { useMemo } from 'react'
import PropTypes from 'prop-types'

/**
 * Computes stake health status from staking data
 * @param {string} stakedAmount - Current staked amount (raw, in token smallest units)
 * @param {string} requiredStake - Required stake amount (raw, in token smallest units)
 * @param {string} slashedAmount - Total slashed amount
 * @returns {{ status: 'healthy'|'warning'|'critical'|'none', label: string, percentage: number }}
 */
export function computeStakeHealth(stakedAmount, requiredStake, slashedAmount) {
  const staked = BigInt(stakedAmount || '0')
  const required = BigInt(requiredStake || '0')
  const slashed = BigInt(slashedAmount || '0')

  if (required === 0n) {
    return { status: 'none', label: 'No stake required', percentage: 100 }
  }

  // Effective stake after slashing
  const effective = staked > slashed ? staked - slashed : 0n

  // Percentage of required stake met (capped at 200 for display)
  const percentage = Number((effective * 100n) / required)

  if (effective >= required) {
    if (percentage >= 150) {
      return { status: 'healthy', label: 'Well-staked', percentage: Math.min(percentage, 200) }
    }
    return { status: 'healthy', label: 'Sufficient', percentage }
  }

  if (percentage >= 80) {
    return { status: 'warning', label: 'At risk', percentage }
  }

  if (effective === 0n) {
    return { status: 'critical', label: 'Not staked', percentage: 0 }
  }

  return { status: 'critical', label: 'Insufficient', percentage }
}

const STATUS_STYLES = {
  healthy: {
    bg: 'bg-emerald-500/15',
    border: 'border-emerald-500/30',
    text: 'text-emerald-400',
    dot: 'bg-emerald-400',
    barBg: 'bg-emerald-500/20',
    barFill: 'bg-emerald-500',
  },
  warning: {
    bg: 'bg-amber-500/15',
    border: 'border-amber-500/30',
    text: 'text-amber-400',
    dot: 'bg-amber-400',
    barBg: 'bg-amber-500/20',
    barFill: 'bg-amber-500',
  },
  critical: {
    bg: 'bg-red-500/15',
    border: 'border-red-500/30',
    text: 'text-red-400',
    dot: 'bg-red-400',
    barBg: 'bg-red-500/20',
    barFill: 'bg-red-500',
  },
  none: {
    bg: 'bg-slate-500/15',
    border: 'border-slate-500/30',
    text: 'text-slate-400',
    dot: 'bg-slate-400',
    barBg: 'bg-slate-500/20',
    barFill: 'bg-slate-500',
  },
}

/**
 * Visual indicator showing provider stake health
 * @param {Object} props
 * @param {string} props.stakedAmount - Current staked amount (raw units)
 * @param {string} props.requiredStake - Required stake amount (raw units)
 * @param {string} props.slashedAmount - Slashed amount (raw units)
 * @param {'compact'|'full'} [props.variant='compact'] - Display variant
 * @returns {JSX.Element}
 */
export default function StakeHealthIndicator({
  stakedAmount,
  requiredStake,
  slashedAmount = '0',
  variant = 'compact',
}) {
  const health = useMemo(
    () => computeStakeHealth(stakedAmount, requiredStake, slashedAmount),
    [stakedAmount, requiredStake, slashedAmount]
  )

  const styles = STATUS_STYLES[health.status]

  if (variant === 'compact') {
    return (
      <span
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${styles.bg} ${styles.border} ${styles.text}`}
        title={`Stake: ${health.percentage}% of required`}
      >
        <span className={`w-1.5 h-1.5 rounded-full ${styles.dot} animate-pulse`} />
        {health.label}
      </span>
    )
  }

  // Full variant with progress bar
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${styles.bg} ${styles.border} ${styles.text}`}
        >
          <span className={`w-1.5 h-1.5 rounded-full ${styles.dot} ${health.status !== 'none' ? 'animate-pulse' : ''}`} />
          {health.label}
        </span>
        <span className="text-xs text-slate-400">
          {Math.min(health.percentage, 100)}%
        </span>
      </div>
      <div className={`w-full h-2 rounded-full ${styles.barBg}`}>
        <div
          className={`h-full rounded-full transition-all duration-500 ${styles.barFill}`}
          style={{ width: `${Math.min(health.percentage, 100)}%` }}
        />
      </div>
    </div>
  )
}

StakeHealthIndicator.propTypes = {
  stakedAmount: PropTypes.string.isRequired,
  requiredStake: PropTypes.string.isRequired,
  slashedAmount: PropTypes.string,
  variant: PropTypes.oneOf(['compact', 'full']),
}
