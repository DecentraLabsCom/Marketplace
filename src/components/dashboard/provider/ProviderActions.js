/**
 * Provider actions component for additional dashboard actions
 * Contains buttons for common provider operations
 */
import React from 'react';
import PropTypes from 'prop-types';

/**
 * Renders action buttons for provider dashboard
 * @param {Object} props - Component props
 * @param {Function} props.onCollectAll - Callback for collecting all balances
 * @param {Function} props.onAddNewLab - Callback for adding a new lab
 * @returns {JSX.Element} Provider actions component
 */
export default function ProviderActions({ 
  onCollectAll,
  onAddNewLab,
  isSSO = false
}) {
  return (
    <div className="mt-6">
      <h3 className="text-lg font-semibold mb-4 text-center">
        Other Actions
      </h3>
      
      <div className="flex space-x-3 justify-center">
        {/* Collect All Button (wallet users only) */}
        {!isSSO && (
          <div className="flex justify-center">
            <button
              onClick={onCollectAll}
              className="px-6 py-3 rounded shadow-lg bg-[#bcc4fc] text-white hover:bg-[#aab8e6] font-bold"
            >
              Collect All
            </button>
          </div>
        )}
        
        {/* Add New Lab Button */}
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
  onCollectAll: PropTypes.func.isRequired,
  onAddNewLab: PropTypes.func.isRequired,
  isSSO: PropTypes.bool
};
