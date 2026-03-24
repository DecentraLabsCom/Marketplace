import React, { useMemo } from 'react'
import PropTypes from 'prop-types'
import { useLabToken } from '@/context/LabTokenContext'

/**
 * Lab pricing and service credit information display component.
 */
export default function LabTokenInfo({ labPrice, durationMinutes, className = '' }) {
  const {
    balance,
    allowance,
    decimals,
    calculateReservationCost,
    checkBalanceAndAllowance,
    formatTokenAmount,
    labTokenAddress,
  } = useLabToken()

  const calculations = useMemo(() => {
    const reservationCost = calculateReservationCost(labPrice, durationMinutes)
    const { hasSufficientBalance, hasSufficientAllowance } = checkBalanceAndAllowance(reservationCost)

    return {
      reservationCost,
      hasSufficientBalance,
      hasSufficientAllowance,
    }
  }, [
    allowance,
    balance,
    calculateReservationCost,
    checkBalanceAndAllowance,
    durationMinutes,
    labPrice,
  ])

  const { reservationCost, hasSufficientBalance, hasSufficientAllowance } = calculations

  if (!labTokenAddress || !decimals) {
    return (
      <div className={`bg-gray-700 rounded-lg p-4 ${className}`}>
        <div className="text-yellow-400">
          Service credit ledger not available on this network
        </div>
      </div>
    )
  }

  return (
    <div className={`bg-gray-700 rounded-lg p-4 ${className}`}>
      <div className="space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-gray-300">Credit balance:</span>
          <span className="text-white font-mono">
            {formatTokenAmount(balance || 0n)} credits
          </span>
        </div>

        {reservationCost > 0n && (
          <div className="flex justify-between">
            <span className="text-gray-300">Reservation Cost:</span>
            <span className="text-white font-mono">
              {formatTokenAmount(reservationCost)} credits
            </span>
          </div>
        )}

        {reservationCost > 0n && (
          <div className="mt-3 space-y-1">
            <div className="flex items-center gap-2">
              <div className={`size-2 rounded-full ${hasSufficientBalance ? 'bg-green-500' : 'bg-red-500'}`} />
              <span className={`text-sm ${hasSufficientBalance ? 'text-green-400' : 'text-red-400'}`}>
                {hasSufficientBalance ? 'Sufficient balance' : 'Insufficient balance'}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <div className={`size-2 rounded-full ${hasSufficientAllowance ? 'bg-green-500' : 'bg-yellow-500'}`} />
              <span className={`text-sm ${hasSufficientAllowance ? 'text-green-400' : 'text-yellow-400'}`}>
                {hasSufficientAllowance ? 'Credits ready to spend' : 'Additional credits required'}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

LabTokenInfo.propTypes = {
  labPrice: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
  durationMinutes: PropTypes.number.isRequired,
  className: PropTypes.string,
}
