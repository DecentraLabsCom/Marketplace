/**
 * Pending Payouts Panel component
 * Displays per-lab pending payout breakdown for the provider
 * Shows wallet vs institutional payout split and total collectible amount
 */
import React, { useMemo } from 'react'
import PropTypes from 'prop-types'
import { usePendingLabPayouts } from '@/hooks/staking/useStakingAtomicQueries'
import { useLabToken } from '@/context/LabTokenContext'
import { formatRawAmount } from '@/utils/blockchain/formatTokens'

/**
 * Revenue split percentages from LibRevenue.sol
 * provider: 70%, treasury: 15%, subsidies: 10%, governance: 5%
 */
const REVENUE_SPLIT = {
  provider: 70,
  treasury: 15,
  subsidies: 10,
  governance: 5,
}

const getLabId = (lab) => lab?.id ?? lab?.tokenId ?? lab?.labId
const getLabName = (lab, labId) => lab?.name || lab?.metadata?.name || `Lab #${labId}`

/**
 * Aggregated pending payouts panel for all provider labs
 * @param {Object} props
 * @param {Array} props.labs - Array of lab objects owned by the provider
 * @param {Function} props.onCollect - Callback to trigger fund collection
 * @param {boolean} props.isCollectEnabled - Whether collect action is enabled
 * @param {boolean} props.isSSO - Whether user is SSO
 * @param {boolean} [props.isCollecting] - Whether collection is in progress
 * @returns {JSX.Element}
 */
export default function PendingPayoutsPanel({
  labs = [],
  onCollect,
  isCollectEnabled = false,
  isSSO = false,
  isCollecting = false,
}) {
  const { decimals } = useLabToken()
  const tokenDecimals = decimals || 6
  const normalizedLabs = useMemo(
    () =>
      labs
        .map((lab) => ({ lab, labId: getLabId(lab) }))
        .filter(({ labId }) => labId !== undefined && labId !== null && labId !== ''),
    [labs]
  )
  const labIds = useMemo(() => normalizedLabs.map(({ labId }) => labId), [normalizedLabs])

  const hasLabs = normalizedLabs.length > 0
  const { data: payoutData, isLoading: payoutsLoading } = usePendingLabPayouts(labIds, {
    enabled: hasLabs,
  })
  const payoutsByLabId = payoutData?.payoutsByLabId || {}

  return (
    <div data-testid="pending-payouts-panel" className="rounded-xl px-3 py-5 space-y-4" style={{ backgroundColor: 'var(--color-background-surface)', border: '1px solid var(--color-ui-label-medium)' }}>

      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
          <span className="text-base">💰</span>
          Pending Payouts
        </h3>
        {hasLabs && !isSSO && (
          <button
            onClick={onCollect}
            disabled={isCollecting || !isCollectEnabled}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-[#bcc4fc] text-white hover:bg-[#aab8e6] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {isCollecting ? (
              <span className="inline-flex items-center gap-1">
                <span className="w-2.5 h-2.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Collecting...
              </span>
            ) : (
              'Collect'
            )}
          </button>
        )}
      </div>

      {/* Revenue split info */}
      <div className="flex gap-1.5">
        {Object.entries(REVENUE_SPLIT).map(([key, pct]) => {
          // all boxes share the same base flex so widths match; governance is 10% larger
          const flexValue = key === 'governance' ? 1.1 : 1
          return (
            <div
              key={key}
              style={{ flex: flexValue }}
              className="text-center py-1.5 rounded bg-slate-900/40"
              title={`${key}: ${pct}% of each reservation payment`}
            >
              <p className="text-[10px] uppercase tracking-wider text-slate-500">{key}</p>
              <p className={`text-xs font-semibold ${key === 'provider' ? 'text-emerald-400' : 'text-slate-400'}`}>
                {pct}%
              </p>
            </div>
          )
        })}
      </div>

      {/* Per-lab payouts */}
      {!hasLabs ? (
        <div className="text-center py-6">
          <p className="text-sm text-slate-500">No labs to show payouts for</p>
        </div>
      ) : (
        <div className="space-y-1 max-h-64 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-600 scrollbar-track-transparent">
          {normalizedLabs.map(({ lab, labId }) => {
            const rowData = payoutsByLabId[String(labId)] || {}
            const totalPayout = rowData?.totalPayout || '0'
            const walletPayout = rowData?.walletPayout || '0'
            const institutionalPayout = rowData?.institutionalPayout || '0'
            const hasPayout = BigInt(totalPayout || '0') > 0n
            const isRowLoading = payoutsLoading && !rowData?.totalPayout

            if (isRowLoading) {
              return (
                <div key={String(labId)} className="flex items-center justify-between py-2.5 px-3 rounded-lg animate-pulse">
                  <div className="h-4 bg-slate-700 rounded w-24" />
                  <div className="h-4 bg-slate-700 rounded w-16" />
                </div>
              )
            }

            return (
              <div
                key={String(labId)}
                className={`flex items-center justify-between py-2.5 px-3 rounded-lg transition-colors ${
                  hasPayout ? 'bg-emerald-900/10 hover:bg-emerald-900/20' : 'bg-slate-900/20 hover:bg-slate-900/30'
                }`}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-slate-200 truncate">{getLabName(lab, labId)}</p>
                  {hasPayout && (
                    <div className="flex gap-3 mt-0.5">
                      {BigInt(walletPayout || '0') > 0n && (
                        <span className="text-[10px] text-slate-400">
                          Wallet: {formatRawAmount(walletPayout, tokenDecimals)}
                        </span>
                      )}
                      {BigInt(institutionalPayout || '0') > 0n && (
                        <span className="text-[10px] text-slate-400">
                          Institutional: {formatRawAmount(institutionalPayout, tokenDecimals)}
                        </span>
                      )}
                    </div>
                  )}
                </div>
                <div className="text-right ml-3">
                  <p className={`text-sm font-semibold ${hasPayout ? 'text-emerald-400' : 'text-slate-500'}`}>
                    {formatRawAmount(totalPayout, tokenDecimals)}
                    <span className="text-xs ml-1 opacity-70">$LAB</span>
                  </p>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* SSO notice */}
      {isSSO && hasLabs && (
        <p className="text-[11px] text-slate-500 italic">
          Fund collection is executed by your institution&apos;s wallet
        </p>
      )}
    </div>
  )
}

PendingPayoutsPanel.propTypes = {
  labs: PropTypes.array,
  onCollect: PropTypes.func,
  isCollectEnabled: PropTypes.bool,
  isSSO: PropTypes.bool,
  isCollecting: PropTypes.bool,
}
