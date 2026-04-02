/**
 * Provider actions component for additional dashboard actions.
 */
import React from 'react';
import PropTypes from 'prop-types';

/**
 * Renders the provider dashboard action button below the calendar.
 * @param {Object} props - Component props
 * @param {Function} props.onAddNewLab - Callback for adding a new lab
 * @returns {JSX.Element} Provider actions component
 */
export default function ProviderActions({ onAddNewLab }) {
  return (
    <div className="mt-6 flex justify-center">
      <div className="flex justify-center">
        <button
          onClick={onAddNewLab}
          className="px-6 py-3 rounded shadow-lg bg-[#7b976e] text-white hover:bg-[#83a875] font-bold"
        >
          Add New Lab
        </button>
      </div>
    </div>
  );
}

ProviderActions.propTypes = {
  onAddNewLab: PropTypes.func.isRequired,
};
