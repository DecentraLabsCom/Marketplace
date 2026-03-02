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
      <div 
        className="rounded-xl p-5 flex items-center justify-between gap-4 shadow-sm hover:shadow-md transition-shadow duration-200"
        style={{ 
          background: 'linear-gradient(135deg, rgba(67, 70, 88, 0.5) 0%, var(--color-background-surface) 100%)',
          border: '1px solid rgba(99, 102, 120, 0.4)' 
        }}
      >
        <div className="flex items-center gap-3">
          <StakeHealthIndicator
            stakedAmount={stakeInfo?.stakedAmount || '0'}
            requiredStake={stakeInfo?.requiredStake || '0'}
            slashedAmount={stakeInfo?.slashedAmount || '0'}
            variant="compact"
          />
          <div>
            <p className="text-sm font-semibold text-white">Staking & Payouts</p>
            <p className="text-xs text-slate-300">Summary & wallet actions</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onManage}
            className="px-5 py-2 rounded-lg text-sm font-medium bg-primary-600 text-white hover:bg-primary-500 transition-all duration-200 shadow-sm hover:shadow-md"
          >
            Manage
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