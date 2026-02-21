import React from 'react'
import PropTypes from 'prop-types'
import StakeHealthIndicator from './StakeHealthIndicator'

/**
 * Compact staking summary card used in Provider Dashboard
 * - lightweight; only shows health badge, label and Manage button
 */
export default function ProviderStakingCompactCard({ stakeInfo = {}, onManage }) {
  return (
    <div className="mt-6">
      <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <StakeHealthIndicator
            stakedAmount={stakeInfo?.stakedAmount || '0'}
            requiredStake={stakeInfo?.requiredStake || '0'}
            slashedAmount={stakeInfo?.slashedAmount || '0'}
            variant="compact"
          />
          <div>
            <p className="text-sm font-semibold text-slate-100">Staking & payouts</p>
            <p className="text-xs text-slate-400">Summary & wallet actions</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onManage}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-[#bcc4fc] text-white hover:bg-[#aab8e6] transition-colors"
          >
            Manage staking
          </button>
        </div>
      </div>
    </div>
  )
}

ProviderStakingCompactCard.propTypes = {
  stakeInfo: PropTypes.object,
  onManage: PropTypes.func.isRequired,
}