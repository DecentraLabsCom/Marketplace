import React from 'react'
import PropTypes from 'prop-types'

/**
 * Compact provider economics summary card used in Provider Dashboard
 * - lightweight; shows receivable indicator and Manage button
 */
export default function ProviderStakingCompactCard({ onManage }) {
  return (
    <div>
      <div 
        className="w-full rounded-xl p-5 flex items-center justify-between gap-4 shadow-sm hover:shadow-md transition-shadow duration-200"
        style={{ 
          background: 'linear-gradient(135deg, rgba(67, 70, 88, 0.5) 0%, var(--color-background-surface) 100%)',
          border: '1px solid rgba(99, 102, 120, 0.4)' 
        }}
      >
        <div className="flex items-center gap-3">
          <span className="text-2xl">💰</span>
          <div>
            <p className="text-sm font-semibold text-white">Provider Receivables</p>
            <p className="text-xs text-slate-300">EUR settlement & revenue breakdown</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onManage}
            className="px-5 py-2 rounded-lg text-sm font-medium bg-primary-600 text-white hover:bg-primary-700 transition-all duration-200 shadow-sm hover:shadow-md"
          >
            View receivables
          </button>
        </div>
      </div>
    </div>
  )
}

ProviderStakingCompactCard.propTypes = {
  onManage: PropTypes.func.isRequired,
}
