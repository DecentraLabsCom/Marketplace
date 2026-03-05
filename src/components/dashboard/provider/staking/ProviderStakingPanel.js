/**
 * Provider Staking Panel component
 * Displays staking status, stake/unstake controls, and stake health
 * for the authenticated provider in the Provider Dashboard
 */
import React, { useState, useMemo, useCallback } from 'react'
import PropTypes from 'prop-types'
import { parseUnits } from 'viem'
import { useStakeInfo, useRequiredStake } from '@/hooks/staking/useStakingAtomicQueries'
import { useStakeTokens, useUnstakeTokens } from '@/hooks/staking/useStakingAtomicMutations'
import { useLabToken } from '@/context/LabTokenContext'
import {
  notifyStakeFailed,
  notifyStakeStarted,
  notifyStakeSuccess,
  notifyUnstakeFailed,
  notifyUnstakeStarted,
  notifyUnstakeSuccess,
} from '@/utils/notifications/stakingToasts'
import { formatRawAmount } from '@/utils/blockchain/formatTokens'
import { BASE_STAKE_DISPLAY, STAKE_PER_ADDITIONAL_LAB_DISPLAY, FREE_LABS_COUNT } from '@/constants/staking'
import StakeHealthIndicator, { computeStakeHealth } from './StakeHealthIndicator'
import devLog from '@/utils/dev/logger'

/**
 * Formats a timestamp to relative time string
 * @param {number} timestamp - Unix timestamp in seconds
 * @returns {string} Human-readable relative time
 */
function formatRelativeTime(timestamp) {
  if (!timestamp) return 'N/A'
  const now = Math.floor(Date.now() / 1000)
  const diff = timestamp - now

  if (diff <= 0) return 'Unlocked'

  const days = Math.floor(diff / 86400)
  const hours = Math.floor((diff % 86400) / 3600)

  if (days > 0) return `${days}d ${hours}h remaining`
  if (hours > 0) return `${hours}h remaining`
  return 'Less than 1h'
}

/**
 * Main provider staking panel
 * @param {Object} props
 * @param {string} props.providerAddress - Provider wallet address
 * @param {boolean} props.isSSO - Whether the user is logged in via SSO
 * @param {number} props.labCount - Number of labs owned by this provider 
 * @param {Function} props.addTemporaryNotification - Temporary notification dispatcher
 * @returns {JSX.Element}
 */
export default function ProviderStakingPanel({
  providerAddress,
  isSSO = false,
  labCount = 0,
  addTemporaryNotification,
}) {
  const [stakeAmount, setStakeAmount] = useState('')
  const [unstakeAmount, setUnstakeAmount] = useState('')
  const [activeAction, setActiveAction] = useState(null) // 'stake' | 'unstake' | null

  const { decimals } = useLabToken()
  const tokenDecimals = decimals || 6

  // Staking data queries
  const {
    data: stakeInfo,
    isLoading: stakeInfoLoading,
    isError: stakeInfoError,
  } = useStakeInfo(providerAddress, {
    enabled: !!providerAddress,
  })

  const {
    data: requiredStakeData,
    isLoading: requiredStakeLoading,
  } = useRequiredStake(providerAddress, {
    enabled: !!providerAddress,
  })

  // Mutations (wallet-only)
  const stakeTokensMutation = useStakeTokens()
  const unstakeTokensMutation = useUnstakeTokens()

  const isLoading = stakeInfoLoading || requiredStakeLoading

  // Derived values
  const stakedAmount = stakeInfo?.stakedAmount || '0'
  const slashedAmount = stakeInfo?.slashedAmount || '0'
  const requiredStake = requiredStakeData?.requiredStake || '0'
  const canUnstake = stakeInfo?.canUnstake || false
  const unlockTimestamp = stakeInfo?.unlockTimestamp || 0

  const stakedFormatted = useMemo(() => formatRawAmount(stakedAmount, tokenDecimals), [stakedAmount, tokenDecimals])
  const requiredFormatted = useMemo(() => formatRawAmount(requiredStake, tokenDecimals), [requiredStake, tokenDecimals])
  const slashedFormatted = useMemo(() => formatRawAmount(slashedAmount, tokenDecimals), [slashedAmount, tokenDecimals])

  const surplus = useMemo(() => {
    const staked = BigInt(stakedAmount || '0')
    const required = BigInt(requiredStake || '0')
    if (staked > required) {
      return formatRawAmount((staked - required).toString(), tokenDecimals)
    }
    return '0.00'
  }, [stakedAmount, requiredStake, tokenDecimals])

  const deficit = useMemo(() => {
    const staked = BigInt(stakedAmount || '0')
    const required = BigInt(requiredStake || '0')
    if (required > staked) {
      return formatRawAmount((required - staked).toString(), tokenDecimals)
    }
    return '0.00'
  }, [stakedAmount, requiredStake, tokenDecimals])

  const lockStatus = useMemo(() => formatRelativeTime(unlockTimestamp), [unlockTimestamp])

  const handleStake = useCallback(async () => {
    if (!stakeAmount || isSSO) return

    try {
      setActiveAction('stake')
      notifyStakeStarted(addTemporaryNotification, stakeAmount)
      const amountInUnits = parseUnits(stakeAmount, tokenDecimals)
      await stakeTokensMutation.mutateAsync({ amount: amountInUnits.toString() })
      setStakeAmount('')
      notifyStakeSuccess(addTemporaryNotification, stakeAmount)
    } catch (error) {
      devLog.error('Stake failed:', error)
      notifyStakeFailed(addTemporaryNotification, error?.message || 'Unknown error')
    } finally {
      setActiveAction(null)
    }
  }, [addTemporaryNotification, isSSO, stakeAmount, stakeTokensMutation, tokenDecimals])

  const handleUnstake = useCallback(async () => {
    if (!unstakeAmount || isSSO) return

    try {
      setActiveAction('unstake')
      notifyUnstakeStarted(addTemporaryNotification, unstakeAmount)
      const amountInUnits = parseUnits(unstakeAmount, tokenDecimals)
      await unstakeTokensMutation.mutateAsync({ amount: amountInUnits.toString() })
      setUnstakeAmount('')
      notifyUnstakeSuccess(addTemporaryNotification, unstakeAmount)
    } catch (error) {
      devLog.error('Unstake failed:', error)
      notifyUnstakeFailed(addTemporaryNotification, error?.message || 'Unknown error')
    } finally {
      setActiveAction(null)
    }
  }, [addTemporaryNotification, isSSO, tokenDecimals, unstakeAmount, unstakeTokensMutation])

  // Loading skeleton
  if (isLoading) {
    return (
      <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5 animate-pulse">
        <div className="h-5 bg-slate-700 rounded w-32 mb-4" />
        <div className="space-y-3">
          <div className="h-4 bg-slate-700 rounded w-full" />
          <div className="h-4 bg-slate-700 rounded w-3/4" />
          <div className="h-8 bg-slate-700 rounded w-full" />
        </div>
      </div>
    )
  }

  // Error state
  if (stakeInfoError) {
    return (
      <div className="bg-red-900/20 border border-red-700/30 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-red-400 mb-1">Staking Error</h3>
        <p className="text-xs text-red-300/70">Failed to load staking data. Please retry.</p>
      </div>
    )
  }

  const health = computeStakeHealth(stakedAmount, requiredStake, slashedAmount)

  return (
    <div data-testid="staking-panel" className="rounded-xl px-3 py-5 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold flex items-center gap-2" style={{ color: 'var(--color-text-primary)' }}>
          <span className="text-base">🔒</span>
          Staking
        </h3>
        {/* Only show compact label in header when there is actual stake info (avoid duplicate 'No stake required') */}
        {health.status !== 'none' && (
          <StakeHealthIndicator
            stakedAmount={stakedAmount}
            requiredStake={requiredStake}
            slashedAmount={slashedAmount}
            variant="compact"
          />
        )}
      </div>

      {/* Health bar */}
      <StakeHealthIndicator
        stakedAmount={stakedAmount}
        requiredStake={requiredStake}
        slashedAmount={slashedAmount}
        variant="full"
      />

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-lg p-3" style={{ backgroundColor: 'var(--color-background-light)' }}>
          <p className="text-[10px] uppercase tracking-wider mb-1 text-black">Staked</p>
          <p className="text-sm font-semibold text-black">
            {stakedFormatted} <span className="text-xs opacity-60 text-black">$LAB</span>
          </p>
        </div>
        <div className="rounded-lg p-3" style={{ backgroundColor: 'var(--color-background-light)' }}>
          <p className="text-[10px] uppercase tracking-wider mb-1 text-black">Required</p>
          <p className="text-sm font-semibold text-black">
            {requiredFormatted} <span className="text-xs opacity-60 text-black">$LAB</span>
          </p>
        </div>
        {BigInt(slashedAmount || '0') > 0n && (
          <div className="rounded-lg p-3" style={{ backgroundColor: 'var(--color-error-bg)' }}>
            <p className="text-[10px] uppercase tracking-wider mb-1" style={{ color: 'var(--color-error-text)', opacity: 0.8 }}>Slashed</p>
            <p className="text-sm font-semibold" style={{ color: 'var(--color-error-text)' }}>
              {slashedFormatted} <span className="text-xs opacity-70">$LAB</span>
            </p>
          </div>
        )}
        {deficit !== '0.00' && (
          <div className="rounded-lg p-3" style={{ backgroundColor: 'var(--color-warning-bg)' }}>
            <p className="text-[10px] uppercase tracking-wider mb-1" style={{ color: 'var(--color-warning-text)', opacity: 0.8 }}>Deficit</p>
            <p className="text-sm font-semibold" style={{ color: 'var(--color-warning-text)' }}>
              {deficit} <span className="text-xs opacity-70">$LAB</span>
            </p>
          </div>
        )}
        {surplus !== '0.00' && deficit === '0.00' && (
          <div className="rounded-lg p-3" style={{ backgroundColor: 'var(--color-success-bg)' }}>
            <p className="text-[10px] uppercase tracking-wider mb-1" style={{ color: 'var(--color-success-text)', opacity: 0.8 }}>Surplus</p>
            <p className="text-sm font-semibold" style={{ color: 'var(--color-success-text)' }}>
              {surplus} <span className="text-xs opacity-70">$LAB</span>
            </p>
          </div>
        )}
      </div>

      {/* Lock status */}
      <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--color-text-secondary)' }}>
        <span>{unlockTimestamp > 0 && lockStatus !== 'Unlocked' ? '🔐' : '🔓'}</span>
        <span>Lock: {lockStatus}</span>
        {labCount > 0 && (
          <>
            <span style={{ color: 'var(--color-ui-label-medium)' }}>·</span>
            <span>{labCount} lab{labCount !== 1 ? 's' : ''}</span>
          </>
        )}
      </div>

      {/* Stake requirements info */}
      <div 
        className="text-[11px] rounded-lg p-3 space-y-1 text-black bg-white"
        style={{ backgroundColor: 'var(--color-background-light)', color: '#000' }}
      >
        <p>Base stake: <span className="font-semibold">{BASE_STAKE_DISPLAY} $LAB</span> (first {FREE_LABS_COUNT} labs)</p>
        <p>Additional labs: <span className="font-semibold">+{STAKE_PER_ADDITIONAL_LAB_DISPLAY} $LAB</span> per lab</p>
      </div>

      {/* Stake/Unstake actions (wallet users only) */}
      {!isSSO && (
        <div className="space-y-3 pt-3" style={{ borderTop: '1px solid var(--color-ui-label-medium)' }}>
          {/* Stake input */}
          <div className="flex gap-2">
            <input
              type="number"
              min="0"
              step="1"
              placeholder="Amount to stake"
              value={stakeAmount}
              onChange={(e) => setStakeAmount(e.target.value)}
              disabled={activeAction === 'stake'}
              className="flex-1 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/50 disabled:opacity-50 transition-all text-black bg-white"
              style={{ 
                backgroundColor: 'var(--color-background-light)', 
                border: '1px solid var(--color-ui-label-medium)',
                color: '#000'
              }}
            />
            <button
              onClick={handleStake}
              disabled={!stakeAmount || activeAction === 'stake' || Number(stakeAmount) <= 0}
              className="w-28 text-center px-4 py-2.5 rounded-lg text-sm font-medium bg-success text-white hover:bg-success-dark disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-sm"
            >
              {activeAction === 'stake' ? (
                <span className="inline-flex items-center justify-center gap-1.5">
                  <span className="size-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Staking...
                </span>
              ) : (
                'Stake'
              )}
            </button>
          </div>

          {/* Unstake input */}
          <div className="flex gap-2">
            <input
              type="number"
              min="0"
              step="1"
              placeholder="Amount to unstake"
              value={unstakeAmount}
              onChange={(e) => setUnstakeAmount(e.target.value)}
              disabled={activeAction === 'unstake' || !canUnstake}
              className="flex-1 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-warning/50 disabled:opacity-50 transition-all text-black bg-white"
              style={{ 
                backgroundColor: 'var(--color-background-light)', 
                border: '1px solid var(--color-ui-label-medium)',
                color: '#000'
              }}
            />
            <button
              onClick={handleUnstake}
              disabled={!unstakeAmount || activeAction === 'unstake' || !canUnstake || Number(unstakeAmount) <= 0}
              className="w-28 text-center px-4 py-2.5 rounded-lg text-sm font-medium bg-warning text-white hover:bg-warning-dark disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-sm"
            >
              {activeAction === 'unstake' ? (
                <span className="inline-flex items-center justify-center gap-1.5">
                  <span className="size-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Unstaking...
                </span>
              ) : (
                'Unstake'
              )}
            </button>
          </div>

          {!canUnstake && BigInt(stakedAmount || '0') > 0n && (
            <p className="text-[11px]" style={{ color: 'var(--color-warning-text)', opacity: 0.8 }}>
              Unstaking locked — active reservations or lock period in effect
            </p>
          )}
        </div>
      )}

      {/* SSO read-only notice */}
      {isSSO && BigInt(stakedAmount || '0') > 0n && (
        <p className="text-[11px] italic" style={{ color: 'var(--color-text-secondary)' }}>
          Stake managed by your institution&apos;s wallet
        </p>
      )}
    </div>
  )
}

ProviderStakingPanel.propTypes = {
  providerAddress: PropTypes.string.isRequired,
  isSSO: PropTypes.bool,
  labCount: PropTypes.number,
  addTemporaryNotification: PropTypes.func,
}
