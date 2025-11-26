/**
 * Lab management actions component for provider dashboard
 * Contains the "Add New Lab" button and other lab management actions
 */
import React from 'react';
import PropTypes from 'prop-types';

/**
 * Renders lab management action buttons
 * @param {Object} props - Component props
 * @param {Function} props.onAddNewLab - Callback to add a new lab
 * @param {Object} props.newLabStructure - Empty lab structure for new labs
 * @param {Function} props.setNewLab - Setter for new lab state
 * @param {Function} props.setIsModalOpen - Setter for modal open state
 * @param {Function} props.setSelectedLabId - Setter for selected lab ID
 * @returns {JSX.Element} Lab management actions component
 */
export default function LabManagementActions({ 
  onAddNewLab,
  newLabStructure,
  setNewLab,
  setIsModalOpen,
  setSelectedLabId
}) {
  /**
   * Handles the add new lab button click
   */
  const handleAddNewLab = () => {
    setNewLab(newLabStructure);
    setIsModalOpen(true);
    setSelectedLabId("");
    if (onAddNewLab) {
      onAddNewLab();
    }
  };

  return (
    <div className="flex justify-center mt-4">
      <button 
        onClick={handleAddNewLab}
        className="px-6 py-3 rounded shadow-lg bg-[#7b976e] text-white hover:bg-[#83a875]"
      >
        Add New Lab
      </button>
    </div>
  );
}

LabManagementActions.propTypes = {
  onAddNewLab: PropTypes.func,
  newLabStructure: PropTypes.shape({
    name: PropTypes.string,
    category: PropTypes.string,
    keywords: PropTypes.array,
    price: PropTypes.string,
    description: PropTypes.string,
    provider: PropTypes.string,
    auth: PropTypes.string,
    accessURI: PropTypes.string,
    accessKey: PropTypes.string,
    timeSlots: PropTypes.array,
    opens: PropTypes.number,
    closes: PropTypes.number,
    docs: PropTypes.array,
    images: PropTypes.array,
    uri: PropTypes.string
  }).isRequired,
  setNewLab: PropTypes.func.isRequired,
  setIsModalOpen: PropTypes.func.isRequired,
  setSelectedLabId: PropTypes.func.isRequired
};
