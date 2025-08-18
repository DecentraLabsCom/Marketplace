import React from 'react'
import PropTypes from 'prop-types'
import Carrousel from '@/components/ui/Carrousel'

/**
 * Provider dashboard item for managing individual labs
 * Displays lab info with action buttons for edit, delete, list/unlist
 * @param {Object} props
 * @param {Object} props.lab - Lab object with id, name, images, price, status
 * @param {Function} props.onEdit - Handler for editing lab
 * @param {Function} props.onDelete - Handler for deleting lab
 * @param {Function} props.onList - Handler for listing lab in marketplace
 * @param {Function} props.onUnlist - Handler for unlisting lab from marketplace
 * @returns {JSX.Element} Provider lab management item with action buttons
 */
const ProviderLabItem = React.memo(function ProviderLabItem({ lab, onEdit, onDelete, onList, onUnlist }) {
  return (
    <div className="p-4 border rounded shadow max-w-4xl mx-auto">
        <h3 className="text-lg font-bold text-center mb-4">{lab.name}</h3>
        <div className="w-full flex">
            <div className="w-2/3">
                <Carrousel lab={lab} maxHeight={200} />
            </div>
            <div className="h-[200px] ml-6 flex flex-col flex-1 items-stretch text-white">
                <button onClick={onEdit}
                className="relative bg-brand h-1/4 overflow-hidden group hover:font-bold"
                >
                    Edit
                    <span className="absolute bottom-0 right-0 size-0 border-b-[3.15em] 
                    border-b-[#5e4a7a] border-l-[7em] border-l-transparent opacity-0 
                    group-hover:opacity-100 transition-opacity duration-300" />
                </button>
                <button onClick={() => onList(lab.id)}
                className="relative bg-[#759ca8] h-1/4 overflow-hidden group hover:font-bold"
                >
                    List
                    <span className="absolute bottom-0 right-0 size-0 border-b-[3.15em] 
                    border-b-[#5f7a91] border-l-[7em] border-l-transparent opacity-0 
                    group-hover:opacity-100 transition-opacity duration-300" />
                </button>
                <button onClick={() => onUnlist(lab.id)}
                className="relative bg-[#7583ab] h-1/4 overflow-hidden group hover:font-bold"
                >
                    Unlist
                    <span className="absolute bottom-0 right-0 size-0 border-b-[3.15em] 
                    border-b-[#5f6a91] border-l-[7em] border-l-transparent opacity-0 
                    group-hover:opacity-100 transition-opacity duration-300" />
                </button>
                <button onClick={() => onDelete(lab.id)}
                className="relative bg-[#a87583] h-1/4 overflow-hidden group hover:font-bold"
                >
                    Delete
                    <span className="absolute bottom-0 right-0 size-0 border-b-[3.15em] 
                    border-b-[#925c69] border-l-[7em] border-l-transparent opacity-0 
                    group-hover:opacity-100 transition-opacity duration-300" />
                </button>
            </div>
        </div>
    </div>
  );
});

ProviderLabItem.propTypes = {
  lab: PropTypes.shape({
    id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
    name: PropTypes.string.isRequired,
    images: PropTypes.array
  }).isRequired,
  onEdit: PropTypes.func.isRequired,
  onDelete: PropTypes.func.isRequired,
  onList: PropTypes.func.isRequired,
  onUnlist: PropTypes.func.isRequired
}

export default ProviderLabItem;
