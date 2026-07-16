import React from 'react'
import PropTypes from 'prop-types'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faSpinner } from '@fortawesome/free-solid-svg-icons'
import Carrousel from '@/components/ui/Carrousel'
import Modal from '@/components/ui/Modal'
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
  const { getEffectiveListingState, getEffectiveLabState } = useOptimisticUI();
  const [isDeleteDialogOpen, setDeleteDialogOpen] = React.useState(false)
  const [typedLabName, setTypedLabName] = React.useState('')
  
  // Get effective listing state (optimistic UI overrides server state)
  const { isListed, isPending, operation } = getEffectiveListingState(lab.id, lab.isListed);
  // Get general optimistic lab state (deleting, editing, etc.)
  const labState = getEffectiveLabState(lab.id, {});
  const isDeleting = !!labState.deleting;
  const isEditing = !!labState.editing;
  const isDeleteConfirmed = typedLabName === lab.name

  const closeDeleteDialog = () => {
    setDeleteDialogOpen(false)
    setTypedLabName('')
  }

  const confirmDelete = () => {
    if (!isDeleteConfirmed || isDeleting) return
    closeDeleteDialog()
    onDelete(lab.id)
  }

  return (
    <div className="p-4 border border-gray-200 rounded shadow">
        <h3 className="text-lg font-bold text-center mb-4 text-slate-100">
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
        <div className="w-full flex">
            <div className="w-2/3">
                <Carrousel lab={lab} maxHeight={200} />
            </div>
            <div className="h-[200px] ml-6 flex flex-col flex-1 items-stretch text-white">
                <button onClick={onEdit}
                disabled={isEditing || isDeleting}
                className={`relative bg-brand h-1/4 overflow-hidden group hover:font-bold ${isEditing || isDeleting ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                    {isEditing ? (
                      <>
                        <FontAwesomeIcon
                          icon={faSpinner}
                          className="ml-2 inline-block animate-spin"
                          data-testid="spinner-edit"
                        />
                        {' '}Editing
                      </>
                    ) : 'Edit'}
                    {!isEditing && (
                      <span className="absolute bottom-0 right-0 size-0 border-b-[3.15em] 
                      border-b-[#5e4a7a] border-l-[7em] border-l-transparent opacity-0 
                      group-hover:opacity-100 transition-opacity duration-300" />
                    )}
                </button>
                <button onClick={() => onList(lab.id)}
                disabled={isListed || isPending || isDeleting}
                className={`relative h-1/4 overflow-hidden group transition-all duration-300 ${
                  isListed || isPending || isDeleting
                    ? 'bg-gray-400 cursor-not-allowed opacity-50' 
                    : 'bg-[#759ca8] hover:font-bold'
                }`}
                >
                    List
                    {isPending && operation === 'listing' && (
                      <FontAwesomeIcon
                        icon={faSpinner}
                        className="ml-2 inline-block animate-spin"
                        data-testid="spinner-list"
                      />
                    )}
                    {!isListed && !isPending && !isDeleting && (
                      <span className="absolute bottom-0 right-0 size-0 border-b-[3.15em] 
                      border-b-[#5f7a91] border-l-[7em] border-l-transparent opacity-0 
                      group-hover:opacity-100 transition-opacity duration-300" />
                    )}
                </button>
                <button onClick={() => onUnlist(lab.id)}
                disabled={!isListed || isPending || isDeleting}
                className={`relative h-1/4 overflow-hidden group transition-all duration-300 ${
                  !isListed || isPending || isDeleting
                    ? 'bg-gray-400 cursor-not-allowed opacity-50' 
                    : 'bg-[#7583ab] hover:font-bold'
                }`}
                >
                    Unlist
                    {isPending && operation === 'unlisting' && (
                      <FontAwesomeIcon
                        icon={faSpinner}
                        className="ml-2 inline-block animate-spin"
                        data-testid="spinner-unlist"
                      />
                    )}
                    {isListed && !isPending && !isDeleting && (
                      <span className="absolute bottom-0 right-0 size-0 border-b-[3.15em] 
                      border-b-[#5f6a91] border-l-[7em] border-l-transparent opacity-0 
                      group-hover:opacity-100 transition-opacity duration-300" />
                    )}
                </button>
                <button onClick={() => setDeleteDialogOpen(true)}
                disabled={isDeleting}
                className={`relative bg-[#a87583] h-1/4 overflow-hidden group hover:font-bold ${isDeleting ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                    {isDeleting ? (
                      <>
                        <FontAwesomeIcon
                          icon={faSpinner}
                          className="ml-2 inline-block animate-spin"
                          data-testid="spinner-delete"
                        />
                        {' '}Deleting
                      </>
                    ) : 'Delete'}
                    {!isDeleting && (
                      <span className="absolute bottom-0 right-0 size-0 border-b-[3.15em] 
                      border-b-[#925c69] border-l-[7em] border-l-transparent opacity-0 
                      group-hover:opacity-100 transition-opacity duration-300" />
                    )}
                </button>
            </div>
        </div>
        <Modal
          isOpen={isDeleteDialogOpen}
          onClose={closeDeleteDialog}
          title="Delete this lab?"
          size="md"
        >
          <div className="space-y-4 text-gray-700">
            <p>This removes the listing and its application-managed metadata.</p>
            <p>This action cannot be reversed from the Marketplace.</p>
            <div>
              <label htmlFor={`delete-lab-confirmation-${lab.id}`} className="block text-sm font-semibold">
                Type the lab name to continue: <span className="font-normal">{lab.name}</span>
              </label>
              <input
                id={`delete-lab-confirmation-${lab.id}`}
                type="text"
                value={typedLabName}
                onChange={(event) => setTypedLabName(event.target.value)}
                className="mt-2 w-full rounded border border-gray-300 px-3 py-2"
                autoComplete="off"
              />
            </div>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={closeDeleteDialog}
                className="rounded border border-gray-300 px-4 py-2 text-sm font-medium hover:bg-gray-100"
              >
                Keep lab
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                disabled={!isDeleteConfirmed || isDeleting}
                className="rounded bg-[#a87583] px-4 py-2 text-sm font-medium text-white hover:bg-[#8a5c66] disabled:cursor-not-allowed disabled:opacity-50"
              >
                Delete lab
              </button>
            </div>
          </div>
        </Modal>
    </div>
  );
});

ProviderLabItem.propTypes = {
  lab: PropTypes.shape({
    id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
    name: PropTypes.string.isRequired,
    images: PropTypes.array,
    isListed: PropTypes.bool
  }).isRequired,
  onEdit: PropTypes.func.isRequired,
  onDelete: PropTypes.func.isRequired,
  onList: PropTypes.func.isRequired,
  onUnlist: PropTypes.func.isRequired
}

export default ProviderLabItem;
