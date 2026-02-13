"use client";
import PropTypes from 'prop-types'
import Modal from '@/components/ui/Modal'

/**
 * Reusable confirmation modal for user actions
 * Provides Yes/No confirmation with escape key support
 * @param {Object} props
 * @param {boolean} props.isOpen - Whether modal is visible
 * @param {Function} props.onClose - Handler for closing/canceling modal
 * @param {Function} props.onContinue - Handler for confirming action
 * @returns {JSX.Element} Modal dialog with confirmation buttons
 */
export default function ConfirmModal({ isOpen, onClose, onContinue }) {
    return (
      <Modal 
        isOpen={isOpen} 
        onClose={onClose}
        title="Confirm Action"
        size="md"
      >
        <div>
          <p className="text-gray-700 mb-4">
            Are you sure you want to proceed?
          </p>
          <div className="flex justify-end gap-3 pt-2">
            <button
              className='px-5 py-2 text-base rounded bg-error hover:bg-error-dark text-white transition-colors'
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              className='px-4 py-2 text-base rounded bg-success hover:bg-success-dark text-white transition-colors'
              onClick={onContinue}
            >
              Continue
            </button>
          </div>
        </div>
      </Modal>
    );
}

ConfirmModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  onContinue: PropTypes.func.isRequired
}
