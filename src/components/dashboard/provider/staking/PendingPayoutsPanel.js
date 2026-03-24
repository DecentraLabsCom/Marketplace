/**
 * Provider Receivables Panel component
 * Displays per-lab provider receivable breakdown for the provider
 * Shows EUR-denominated settlement amounts derived from credit accruals
 */
import React, { useMemo } from 'react'
import PropTypes from 'prop-types'
import { useProviderReceivables } from '@/hooks/staking/useStakingAtomicQueries'
import { useLabToken } from '@/context/LabTokenContext'
import { formatRawAmount } from '@/utils/blockchain/formatTokens'

/**
 * Revenue split percentages from LibRevenue.sol
 * provider: 70%, platform: 15%, subsidies: 10%, governance: 5%
 */
const REVENUE_SPLIT = {
  provider: 70,
  platform: 15,
  subsidies: 10,
  governance: 5,
}

const getLabId = (lab) => lab?.id ?? lab?.tokenId ?? lab?.labId
const getLabName = (lab, labId) => lab?.name || lab?.metadata?.name || `Lab #${labId}`

/**
 * Aggregated provider receivables panel for all provider labs
 * @param {Object} props
 * @param {Array} props.labs - Array of lab objects owned by the provider
 * @param {Function} props.onRequestSettlement - Callback to trigger provider settlement request
 * @param {boolean} props.isSettlementEnabled - Whether settlement request is enabled
 * @param {boolean} props.isSSO - Whether user is SSO
 * @param {boolean} [props.isRequestingSettlement] - Whether settlement request is in progress
 * @returns {JSX.Element}
 */
export default function PendingPayoutsPanel({
  labs = [],
  onRequestSettlement,
  isSettlementEnabled = false,
  isSSO = false,
  isRequestingSettlement = false,
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
  const { data: payoutData, isLoading: payoutsLoading } = useProviderReceivables(labIds, {
    enabled: hasLabs,
  })
  const receivablesByLabId = payoutData?.receivablesByLabId || {}

  return (
    <div data-testid="pending-payouts-panel" className="rounded-xl px-3 py-5 space-y-4" style={{ backgroundColor: 'var(--color-background-surface)', border: '1px solid var(--color-ui-label-medium)' }}>

      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold flex items-center gap-2" style={{ color: 'var(--color-text-inverse)' }}>
          <span className="text-base">💰</span>
          Provider Receivables (EUR)
        </h3>
        {hasLabs && !isSSO && (
          <button
            onClick={onRequestSettlement}
            disabled={isRequestingSettlement || !isSettlementEnabled}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-success text-white hover:bg-success-dark disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-sm"
          >
            {isRequestingSettlement ? (
              <span className="inline-flex items-center gap-1.5">
                <span className="size-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Requesting...
              </span>
            ) : (
              'Request settlement'
            )}
          </button>
        )}
      </div>

      {/* Revenue split info */}
      <div className="flex gap-1.5">
        {Object.entries(REVENUE_SPLIT).map(([key, pct]) => {
          // all boxes share the same base flex so widths match; governance is 10% larger
          const flexValue = key === 'governance' ? 1.1 : 1
          const isProvider = key === 'provider'
          return (
            <div
              key={key}
              style={{ 
                flex: flexValue, 
                backgroundColor: 'var(--color-background-dark)' 
              }}
              className="text-center py-2 rounded-lg"
              title={`${key}: ${pct}% of each reservation payment`}
            >
              <p className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--color-text-secondary)' }}>{key}</p>
              <p 
                className="text-xs font-semibold"
                style={{ color: isProvider ? 'var(--color-success-text)' : 'var(--color-text-inverse)' }}
              >
                {pct}%
              </p>
            </div>
          )
        })}
      </div>

      {/* Per-lab payouts */}
      {!hasLabs ? (
        <div className="text-center py-6">
          <p className="text-sm" style={{ color: 'var(--color-text-inverse)' }}>No labs to show receivables for</p>
        </div>
      ) : (
        <div className="space-y-1.5 max-h-64 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-600 scrollbar-track-transparent">
          {normalizedLabs.map(({ lab, labId }) => {
            const rowData = receivablesByLabId[String(labId)] || {}
            const totalReceivable = rowData?.totalReceivable ?? '0'
            const providerReceivable = rowData?.providerReceivable ?? '0'
            const deferredInstitutionalReceivable = rowData?.deferredInstitutionalReceivable ?? '0'
            const hasReceivable = BigInt(totalReceivable || '0') > 0n
            const isRowLoading = payoutsLoading && !rowData?.totalReceivable

            if (isRowLoading) {
              return (
                <div key={String(labId)} className="flex items-center justify-between py-2.5 px-3 rounded-lg animate-pulse" style={{ backgroundColor: 'var(--color-background-dark)' }}>
                  <div className="h-4 rounded w-24" style={{ backgroundColor: 'var(--color-ui-label-medium)' }} />
                  <div className="h-4 rounded w-16" style={{ backgroundColor: 'var(--color-ui-label-medium)' }} />
                </div>
              )
            }

            return (
              <div
                key={String(labId)}
                className="flex items-center justify-between py-2.5 px-3 rounded-lg transition-colors"
                style={{ 
                  backgroundColor: hasReceivable ? 'var(--color-success-bg)' : 'var(--color-background-dark)',
                }}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm truncate" style={{ color: 'var(--color-text-inverse)' }}>{getLabName(lab, labId)}</p>
                  {hasReceivable && (
                    <div className="flex gap-3 mt-0.5">
                      {BigInt(providerReceivable || '0') > 0n && (
                        <span className="text-[10px]" style={{ color: 'var(--color-text-secondary)' }}>
                          Your share: {formatRawAmount(providerReceivable, tokenDecimals)} EUR
                        </span>
                      )}
                      {BigInt(deferredInstitutionalReceivable || '0') > 0n && (
                        <span className="text-[10px]" style={{ color: 'var(--color-text-secondary)' }}>
                          Platform deferred: {formatRawAmount(deferredInstitutionalReceivable, tokenDecimals)} EUR
                        </span>
                      )}
                    </div>
                  )}
                </div>
                <div className="text-right ml-3">
                  <p 
                    className="text-sm font-semibold"
                    style={{ color: hasReceivable ? 'var(--color-success-text)' : 'var(--color-text-secondary)' }}
                  >
                    {formatRawAmount(totalReceivable, tokenDecimals)}
                    <span className="text-xs ml-1 opacity-70">EUR</span>
                  </p>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* SSO notice */}
      {isSSO && hasLabs && (
        <p className="text-[11px] italic" style={{ color: 'var(--color-text-secondary)' }}>
          Provider settlement requests are executed by your institution&apos;s wallet
        </p>
      )}

      {/* EUR settlement note */}
      <p className="text-[10px]" style={{ color: 'var(--color-text-secondary)' }}>
        Amounts shown are EUR-equivalent settlement values. Payouts are processed in EUR via bank transfer.
      </p>
    </div>
  )
}

PendingPayoutsPanel.propTypes = {
  labs: PropTypes.array,
  onRequestSettlement: PropTypes.func,
  isSettlementEnabled: PropTypes.bool,
  isSSO: PropTypes.bool,
  isRequestingSettlement: PropTypes.bool,
}
