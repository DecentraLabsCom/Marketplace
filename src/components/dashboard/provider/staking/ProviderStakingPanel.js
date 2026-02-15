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
import StakeHealthIndicator, { computeStakeHealth } from './StakeHealthIndicator'
import devLog from '@/utils/dev/logger'

/**
 * Constants from the smart contracts (LibStaking.sol)
 * BASE_STAKE = 800 tokens, STAKE_PER_ADDITIONAL_LAB = 200 tokens
 * FREE_LABS_COUNT = 10 (first 10 labs don't require additional stake beyond base)
 */
const BASE_STAKE_DISPLAY = 800
const STAKE_PER_ADDITIONAL_LAB_DISPLAY = 200
const FREE_LABS_COUNT = 10

/**
 * Formats a raw token amount (smallest units) to a human-readable string
 * @param {string} rawAmount - Amount in smallest token units
 * @param {number} decimals - Token decimals (default 6 for $LAB)
 * @returns {string} Formatted amount with 2 decimal places
 */
function formatRawAmount(rawAmount, decimals = 6) {
  if (!rawAmount || rawAmount === '0') return '0.00'
  try {
    const value = BigInt(rawAmount)
    const divisor = 10n ** BigInt(decimals)
    const whole = value / divisor
    const fraction = value % divisor
    const fractionStr = fraction.toString().padStart(decimals, '0').slice(0, 2)
    return `${whole}.${fractionStr}`
  } catch {
    return '0.00'
  }
}

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
 * @param {Function} props.onNotify - Callback for notifications
 * @returns {JSX.Element}
 */
export default function ProviderStakingPanel({
  providerAddress,
  isSSO = false,
  labCount = 0,
  onNotify,
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
      const amountInUnits = parseUnits(stakeAmount, tokenDecimals)
      await stakeTokensMutation.mutateAsync({ amount: amountInUnits.toString() })
      setStakeAmount('')
      onNotify?.('success', `Successfully staked ${stakeAmount} $LAB`)
    } catch (error) {
      devLog.error('Stake failed:', error)
      onNotify?.('error', `Stake failed: ${error.message || 'Unknown error'}`)
    } finally {
      setActiveAction(null)
    }
  }, [stakeAmount, isSSO, tokenDecimals, stakeTokensMutation, onNotify])

  const handleUnstake = useCallback(async () => {
    if (!unstakeAmount || isSSO) return

    try {
      setActiveAction('unstake')
      const amountInUnits = parseUnits(unstakeAmount, tokenDecimals)
      await unstakeTokensMutation.mutateAsync({ amount: amountInUnits.toString() })
      setUnstakeAmount('')
      onNotify?.('success', `Successfully unstaked ${unstakeAmount} $LAB`)
    } catch (error) {
      devLog.error('Unstake failed:', error)
      onNotify?.('error', `Unstake failed: ${error.message || 'Unknown error'}`)
    } finally {
      setActiveAction(null)
    }
  }, [unstakeAmount, isSSO, tokenDecimals, unstakeTokensMutation, onNotify])

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
    <div data-testid="staking-panel" className="rounded-xl px-3 py-5 space-y-4" style={{ backgroundColor: 'var(--color-background-surface)', border: '1px solid var(--color-ui-label-medium)' }}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
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
        <div className="bg-slate-900/40 rounded-lg p-3">
          <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Staked</p>
          <p className="text-sm font-semibold text-slate-100">{stakedFormatted} <span className="text-xs text-slate-400">$LAB</span></p>
        </div>
        <div className="bg-slate-900/40 rounded-lg p-3">
          <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Required</p>
          <p className="text-sm font-semibold text-slate-100">{requiredFormatted} <span className="text-xs text-slate-400">$LAB</span></p>
        </div>
        {BigInt(slashedAmount || '0') > 0n && (
          <div className="bg-red-900/20 rounded-lg p-3">
            <p className="text-[10px] uppercase tracking-wider text-red-400/70 mb-1">Slashed</p>
            <p className="text-sm font-semibold text-red-400">{slashedFormatted} <span className="text-xs text-red-400/70">$LAB</span></p>
          </div>
        )}
        {deficit !== '0.00' && (
          <div className="bg-amber-900/20 rounded-lg p-3">
            <p className="text-[10px] uppercase tracking-wider text-amber-400/70 mb-1">Deficit</p>
            <p className="text-sm font-semibold text-amber-400">{deficit} <span className="text-xs text-amber-400/70">$LAB</span></p>
          </div>
        )}
        {surplus !== '0.00' && deficit === '0.00' && (
          <div className="bg-emerald-900/20 rounded-lg p-3">
            <p className="text-[10px] uppercase tracking-wider text-emerald-400/70 mb-1">Surplus</p>
            <p className="text-sm font-semibold text-emerald-400">{surplus} <span className="text-xs text-emerald-400/70">$LAB</span></p>
          </div>
        )}
      </div>

      {/* Lock status */}
      <div className="flex items-center gap-2 text-xs text-slate-400">
        <span>{unlockTimestamp > 0 && lockStatus !== 'Unlocked' ? '🔐' : '🔓'}</span>
        <span>Lock: {lockStatus}</span>
        {labCount > 0 && (
          <>
            <span className="text-slate-600">·</span>
            <span>{labCount} lab{labCount !== 1 ? 's' : ''}</span>
          </>
        )}
      </div>

      {/* Stake requirements info */}
      <div className="text-[11px] text-slate-500 bg-slate-900/30 rounded-lg p-2.5 space-y-1">
        <p>Base stake: <span className="text-slate-300">{BASE_STAKE_DISPLAY} $LAB</span> (first {FREE_LABS_COUNT} labs)</p>
        <p>Additional labs: <span className="text-slate-300">+{STAKE_PER_ADDITIONAL_LAB_DISPLAY} $LAB</span> per lab</p>
      </div>

      {/* Stake/Unstake actions (wallet users only) */}
      {!isSSO && (
        <div className="space-y-3 pt-2 border-t border-slate-700/50">
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
              className="flex-1 bg-slate-900/60 border border-slate-600/50 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500/50 disabled:opacity-50"
            />
            <button
              onClick={handleStake}
              disabled={!stakeAmount || activeAction === 'stake' || Number(stakeAmount) <= 0}
              className="w-32 text-center px-4 py-2 rounded-lg text-sm font-medium bg-emerald-600 text-white hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {activeAction === 'stake' ? (
                <span className="inline-flex items-center gap-1">
                  <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
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
              className="flex-1 bg-slate-900/60 border border-slate-600/50 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-500/50 disabled:opacity-50"
            />
            <button
              onClick={handleUnstake}
              disabled={!unstakeAmount || activeAction === 'unstake' || !canUnstake || Number(unstakeAmount) <= 0}
              className="w-32 text-center px-4 py-2 rounded-lg text-sm font-medium bg-amber-600 text-white hover:bg-amber-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {activeAction === 'unstake' ? (
                <span className="inline-flex items-center gap-1">
                  <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Unstaking...
                </span>
              ) : (
                'Unstake'
              )}
            </button>
          </div>

          {!canUnstake && BigInt(stakedAmount || '0') > 0n && (
            <p className="text-[11px] text-amber-400/70">
              Unstaking locked — active reservations or lock period in effect
            </p>
          )}
        </div>
      )}

      {/* SSO read-only notice */}
      {isSSO && BigInt(stakedAmount || '0') > 0n && (
        <p className="text-[11px] text-slate-500 italic">
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
  onNotify: PropTypes.func,
}
