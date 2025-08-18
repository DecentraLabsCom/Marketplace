import React, { useMemo } from 'react'
import PropTypes from 'prop-types'
import { useLabToken } from '@/context/LabTokenContext'

/**
 * Lab pricing and token information display component
 * Shows cost calculations, user balance, and booking affordability status
 * @param {Object} props
 * @param {string|number} props.labPrice - Lab price per hour in tokens
 * @param {number} props.durationMinutes - Booking duration in minutes
 * @param {string} props.className - Additional CSS classes to apply
 * @returns {JSX.Element} Pricing information panel with cost breakdown and balance status
 */
export default function LabTokenInfo({ labPrice, durationMinutes, className = '' }) {
  const { 
    balance, 
    decimals, 
    calculateReservationCost, 
    checkBalanceAndAllowance, 
    formatTokenAmount,
    labTokenAddress
  } = useLabToken();

  // Memoize calculations to prevent unnecessary re-renders
  const calculations = useMemo(() => {
    const reservationCost = calculateReservationCost(labPrice, durationMinutes);
    const { hasSufficientBalance, hasSufficientAllowance } = checkBalanceAndAllowance(reservationCost);
    
    return {
      reservationCost,
      hasSufficientBalance,
      hasSufficientAllowance
    };
  }, [labPrice, durationMinutes, calculateReservationCost, checkBalanceAndAllowance]);

  const { reservationCost, hasSufficientBalance, hasSufficientAllowance } = calculations;

  // Don't show if there is no data or address associated to the token
  if (!labTokenAddress || !decimals) {
    return (
      <div className={`bg-gray-700 rounded-lg p-4 ${className}`}>
        <div className="text-yellow-400">
          ⚠️ LAB token contract not available on this network
        </div>
      </div>
    );
  }

  return (
    <div className={`bg-gray-700 rounded-lg p-4 ${className}`}>
      <div className="space-y-2 text-sm">
        {/* Current balance */}
        <div className="flex justify-between">
          <span className="text-gray-300">$LAB Balance:</span>
          <span className="text-white font-mono">
            {formatTokenAmount(balance || 0n)} $LAB
          </span>
        </div>

        {/* Booking cost */}
        {reservationCost > 0n && (
          <div className="flex justify-between">
            <span className="text-gray-300">Reservation Cost:</span>
            <span className="text-white font-mono">
              {formatTokenAmount(reservationCost)} $LAB
            </span>
          </div>
        )}

        {/* State indicators */}
        {reservationCost > 0n && (
          <div className="mt-3 space-y-1">
            {/* Balance state */}
            <div className="flex items-center gap-2">
              <div className={`size-2 rounded-full ${hasSufficientBalance ? 'bg-green-500' : 'bg-red-500'}`}></div>
              <span className={`text-sm ${hasSufficientBalance ? 'text-green-400' : 'text-red-400'}`}>
                {hasSufficientBalance ? 'Sufficient balance' : 'Insufficient balance'}
              </span>
            </div>

            {/* Approval state */}
            <div className="flex items-center gap-2">
              <div className={`size-2 rounded-full ${hasSufficientAllowance ? 'bg-green-500' : 'bg-yellow-500'}`}></div>
              <span className={`text-sm ${hasSufficientAllowance ? 'text-green-400' : 'text-yellow-400'}`}>
                {hasSufficientAllowance ? 'Tokens approved' : 'Approval required'}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

LabTokenInfo.propTypes = {
  labPrice: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
  durationMinutes: PropTypes.number.isRequired,
  className: PropTypes.string
}

LabTokenInfo.defaultProps = {
  className: ''
}
