"use client";
import { useEffect } from 'react'
import PropTypes from 'prop-types'

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
    useEffect(() => {
        if (!isOpen) return;
        const handleKeyDown = (e) => {
          if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onClose]);
    
    if (!isOpen) return null;

    return (
      <div className="fixed inset-0 bg-black/20 flex justify-center items-center z-50"
        onClick={onClose}
      >
        <div className="bg-white rounded-lg shadow-lg p-6 w-96"
        onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg text-gray-800 font-bold mb-4">
            Are you sure you want to proceed?</h2>
            <div className="flex flex-row pt-4 justify-between px-10">
            <button
                className='px-3 mr-3 py-1 text-lg rounded bg-success hover:bg-success-dark text-white'
                onClick={onContinue}
                >Continue</button>
            <button onClick={onClose} className='px-5 mr-3 py-1 text-lg rounded bg-error hover:bg-error-dark
            text-white'>Cancel</button>
            </div>
        </div>
      </div>
    );
}

ConfirmModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  onContinue: PropTypes.func.isRequired
}
