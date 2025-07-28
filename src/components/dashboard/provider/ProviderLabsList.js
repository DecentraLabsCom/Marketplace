/**
 * Provider labs management component
 * Handles display and selection of provider's owned labs
 */
import React from 'react';
import PropTypes from 'prop-types';
import ProviderLabItem from '@/components/dashboard/provider/ProviderLabItem';
import LabManagementActions from '@/components/dashboard/provider/LabManagementActions';

/**
 * Renders the provider's labs list with selection and management options
 * @param {Object} props - Component props
 * @param {Array} props.ownedLabs - Array of labs owned by the provider
 * @param {Object|null} props.selectedLab - Currently selected lab object
 * @param {string} props.selectedLabId - ID of currently selected lab
 * @param {boolean} props.isLoading - Loading state for labs
 * @param {Function} props.onSelectChange - Callback when lab selection changes
 * @param {Function} props.onEdit - Callback to edit a lab
 * @param {Function} props.onCollect - Callback to collect tokens from a lab
 * @param {Function} props.onDelete - Callback to delete a lab
 * @param {Function} props.onList - Callback to list a lab
 * @param {Function} props.onUnlist - Callback to unlist a lab
 * @param {Function} props.onCollectAll - Callback to collect all tokens
 * @param {Object} props.newLabStructure - Empty lab structure for new labs
 * @param {Function} props.setNewLab - Setter for new lab state
 * @param {Function} props.setIsModalOpen - Setter for modal open state
 * @param {Function} props.setSelectedLabId - Setter for selected lab ID
 * @returns {JSX.Element} Provider labs management component
 */
export default function ProviderLabsList({ 
  ownedLabs = [], 
  selectedLab = null,
  selectedLabId = "",
  isLoading = false,
  onSelectChange,
  onEdit,
  onCollect,
  onDelete,
  onList,
  onUnlist,
  onCollectAll,
  newLabStructure,
  setNewLab,
  setIsModalOpen,
  setSelectedLabId
}) {
  if (isLoading) {
    return (
      <div className="w-full min-[1080px]:w-2/3">
        <h2 className="text-xl font-semibold mb-4 text-center">Your Labs</h2>
        <p className="text-gray-300 text-center">Loading labs...</p>
      </div>
    );
  }

  if (ownedLabs.length === 0) {
    return (
      <div className="w-full min-[1080px]:w-2/3">
        <h2 className="text-xl font-semibold mb-4 text-center">Your Labs</h2>
        <p className="text-gray-300 text-center">
          You have no labs registered yet. Press &quot;Add New Lab&quot; to get started.
        </p>
      </div>
    );
  }

  return (
    <div className="w-full min-[1080px]:w-2/3">
      <h2 className="text-xl font-semibold mb-4 text-center">Your Labs</h2>
      
      {/* Collect All Button */}
      <div className="flex justify-center mb-4">
        <button 
          onClick={onCollectAll}
          className="bg-[#bcc4fc] text-white px-6 py-2 rounded shadow hover:bg-[#aab8e6] font-bold"
        >
          Collect All
        </button>
      </div>
      
      <LabManagementActions
        newLabStructure={newLabStructure}
        setNewLab={setNewLab}
        setIsModalOpen={setIsModalOpen}
        setSelectedLabId={setSelectedLabId}
      />
      
      {/* Lab Selector */}
      <div className="flex justify-center">
        <select 
          className="w-full p-3 border-2 bg-gray-800 text-white rounded mb-4 max-w-4xl"
          value={selectedLabId}
          onChange={onSelectChange}
        >
          <option value="" disabled>
            Select one of your labs
          </option>
          {ownedLabs
            .filter(lab => !isNaN(lab.id))
            .map((lab) => (
              <option key={lab.id} value={lab.id}>
                {lab.name}
              </option>
            ))
          }
        </select>
      </div>
      
      {/* Selected Lab Details */}
      {selectedLab && (
        <ProviderLabItem
          lab={selectedLab}
          onEdit={onEdit}
          onCollect={onCollect}
          onDelete={onDelete}
          onList={onList}
          onUnlist={onUnlist}
        />
      )}
    </div>
  );
}

ProviderLabsList.propTypes = {
  ownedLabs: PropTypes.arrayOf(PropTypes.shape({
    id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
    name: PropTypes.string.isRequired
  })),
  selectedLab: PropTypes.shape({
    id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
    name: PropTypes.string.isRequired
  }),
  selectedLabId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  isLoading: PropTypes.bool,
  onSelectChange: PropTypes.func.isRequired,
  onEdit: PropTypes.func.isRequired,
  onCollect: PropTypes.func.isRequired,
  onDelete: PropTypes.func.isRequired,
  onList: PropTypes.func.isRequired,
  onUnlist: PropTypes.func.isRequired,
  onCollectAll: PropTypes.func.isRequired,
  newLabStructure: PropTypes.object.isRequired,
  setNewLab: PropTypes.func.isRequired,
  setIsModalOpen: PropTypes.func.isRequired,
  setSelectedLabId: PropTypes.func.isRequired
};
