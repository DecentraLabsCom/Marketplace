import React from 'react'
import PropTypes from 'prop-types'
import Carrousel from '@/components/ui/Carrousel'
import { useOptimisticUI } from '@/context/OptimisticUIContext'

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
  const { getEffectiveListingState } = useOptimisticUI();
  
  // Get effective listing state (optimistic UI overrides server state)
  const { isListed, isPending, operation } = getEffectiveListingState(lab.id, lab.isListed);

  return (
    <div className="p-4 border rounded shadow max-w-4xl mx-auto">
        <h3 className="text-lg font-bold text-center mb-2">
          {lab.name}
          <span className={`ml-2 text-sm font-normal ${
            isPending 
              ? 'text-yellow-300' 
              : isListed 
                ? 'text-emerald-300' 
                : 'text-rose-300'
          }`}>
            {isPending 
              ? `(${operation === 'listing' ? 'Listing...' : 'Unlisting...'})`
              : `(${isListed ? 'Listed' : 'Unlisted'})`
            }
          </span>
        </h3>

        {/* Categories */}
        {lab?.category && (
          <div className="flex justify-center gap-2 mb-4">
            {Array.isArray(lab.category) ? (
              lab.category.map((cat) => (
                <span key={cat} className="bg-ui-label-dark text-neutral-200 inline-flex items-center justify-center py-1 px-3 text-sm rounded">
                  {cat}
                </span>
              ))
            ) : (
              <span className="bg-ui-label-dark text-neutral-200 inline-flex items-center justify-center py-1 px-3 text-sm rounded">
                {lab.category}
              </span>
            )}
          </div>
        )}
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
                disabled={isListed || isPending}
                className={`relative h-1/4 overflow-hidden group transition-all duration-300 ${
                  isListed || isPending
                    ? 'bg-gray-400 cursor-not-allowed opacity-50' 
                    : 'bg-[#759ca8] hover:font-bold'
                }`}
                >
                    List
                    {!isListed && !isPending && (
                      <span className="absolute bottom-0 right-0 size-0 border-b-[3.15em] 
                      border-b-[#5f7a91] border-l-[7em] border-l-transparent opacity-0 
                      group-hover:opacity-100 transition-opacity duration-300" />
                    )}
                </button>
                <button onClick={() => onUnlist(lab.id)}
                disabled={!isListed || isPending}
                className={`relative h-1/4 overflow-hidden group transition-all duration-300 ${
                  !isListed || isPending
                    ? 'bg-gray-400 cursor-not-allowed opacity-50' 
                    : 'bg-[#7583ab] hover:font-bold'
                }`}
                >
                    Unlist
                    {isListed && !isPending && (
                      <span className="absolute bottom-0 right-0 size-0 border-b-[3.15em] 
                      border-b-[#5f6a91] border-l-[7em] border-l-transparent opacity-0 
                      group-hover:opacity-100 transition-opacity duration-300" />
                    )}
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
    images: PropTypes.array,
    isListed: PropTypes.bool,
    category: PropTypes.oneOfType([PropTypes.string, PropTypes.arrayOf(PropTypes.string)])
  }).isRequired,
  onEdit: PropTypes.func.isRequired,
  onDelete: PropTypes.func.isRequired,
  onList: PropTypes.func.isRequired,
  onUnlist: PropTypes.func.isRequired
}

export default ProviderLabItem;
