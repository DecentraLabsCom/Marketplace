/**
 * Provider actions component for additional dashboard actions
 * Contains buttons for common provider operations
 */
import React from 'react';
import PropTypes from 'prop-types';

/**
 * Renders action buttons for provider dashboard
 * @param {Object} props - Component props
 * @param {Function} props.onCollect - Callback for collecting selected lab balance
 * @param {boolean} props.isCollectEnabled - Whether collect action is enabled
 * @param {boolean} props.isCollecting - Whether collect action is in progress
 * @param {Function} props.onAddNewLab - Callback for adding a new lab
 * @returns {JSX.Element} Provider actions component
 */
export default function ProviderActions({ 
  onCollect,
  isCollectEnabled = false,
  isCollecting = false,
  onAddNewLab,
  isSSO = false
}) {
  return (
    <div className="mt-6">
      <h3 className="text-lg font-semibold mb-4 text-center text-slate-100">
        Other Actions
      </h3>
      
      <div className="flex space-x-3 justify-center">
        {/* Collect Button (wallet users only) */}
        {!isSSO && (
          <div className="flex justify-center">
            <button
              onClick={onCollect}
              disabled={!isCollectEnabled || isCollecting}
              className="px-6 py-3 rounded shadow-lg bg-[#bcc4fc] text-white hover:bg-[#aab8e6] font-bold disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isCollecting ? 'Collecting...' : 'Collect'}
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
  onCollect: PropTypes.func.isRequired,
  isCollectEnabled: PropTypes.bool,
  isCollecting: PropTypes.bool,
  onAddNewLab: PropTypes.func.isRequired,
  isSSO: PropTypes.bool
};
