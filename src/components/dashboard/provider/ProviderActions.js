/**
 * Provider actions component for additional dashboard actions.
 */
import React from 'react';
import PropTypes from 'prop-types';

/**
 * Renders action buttons for provider dashboard.
 * @param {Object} props - Component props
 * @param {Function} props.onRequestSettlement - Callback for requesting provider settlement on the selected lab
 * @param {boolean} props.isSettlementEnabled - Whether settlement request action is enabled
 * @param {boolean} props.isRequestingSettlement - Whether settlement request action is in progress
 * @param {Function} props.onAddNewLab - Callback for adding a new lab
 * @returns {JSX.Element} Provider actions component
 */
export default function ProviderActions({
  onRequestSettlement,
  isSettlementEnabled = false,
  isRequestingSettlement = false,
  onAddNewLab,
}) {
  return (
    <div className="mt-6">
      <h3 className="text-lg font-semibold mb-4 text-center text-slate-100">
        Other Actions
      </h3>

      <div className="flex space-x-3 justify-center">
        <div className="flex justify-center">
          <button
            onClick={onRequestSettlement}
            disabled={!isSettlementEnabled || isRequestingSettlement}
            className="px-6 py-3 rounded shadow-lg bg-[#bcc4fc] text-white hover:bg-[#aab8e6] font-bold disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isRequestingSettlement ? 'Requesting settlement...' : 'Request Settlement'}
          </button>
        </div>

        <div className="flex justify-center">
          <button
            onClick={onAddNewLab}
            className="px-6 py-3 rounded shadow-lg bg-[#7b976e] text-white hover:bg-[#83a875] font-bold"
          >
            Add New Lab
          </button>
        </div>
      </div>
    </div>
  );
}

ProviderActions.propTypes = {
  onRequestSettlement: PropTypes.func.isRequired,
  isSettlementEnabled: PropTypes.bool,
  isRequestingSettlement: PropTypes.bool,
  onAddNewLab: PropTypes.func.isRequired,
};
