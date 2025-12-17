/**
 * Generic Modal Component
 * 
 * Reusable modal dialog with customizable content, title, and size.
 * Supports keyboard (Escape) and click-outside to close.
 * 
 * @module components/ui/Modal
 */

"use client";

import { useEffect, useRef } from 'react'
import PropTypes from 'prop-types'

/**
 * Size variants for the modal
 * @readonly
 * @enum {string}
 */
const SIZES = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
  '2xl': 'max-w-2xl',
  full: 'max-w-full mx-4',
}

/**
 * Generic Modal component
 * 
 * @param {Object} props - Component props
 * @param {boolean} props.isOpen - Whether the modal is visible
 * @param {function} [props.onClose] - Handler for closing the modal (if not provided, modal cannot be closed)
 * @param {string} [props.title] - Optional title displayed in header
 * @param {string} [props.size='md'] - Modal size: 'sm', 'md', 'lg', 'xl', '2xl', 'full'
 * @param {React.ReactNode} props.children - Modal content
 * @param {boolean} [props.showCloseButton=true] - Whether to show the X close button
 * @param {string} [props.className] - Additional CSS classes for the content container
 * @returns {JSX.Element|null} Modal dialog or null when closed
 */
export default function Modal({ 
  isOpen, 
  onClose, 
  title,
  size = 'md',
  children,
  showCloseButton = true,
  className = '',
}) {
  const modalRef = useRef(null)

  // Handle Escape key
  useEffect(() => {
    if (!isOpen || !onClose) return
    
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }
    
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  // Lock body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [isOpen])

  // Focus trap (basic - focuses modal on open)
  useEffect(() => {
    if (isOpen && modalRef.current) {
      modalRef.current.focus()
    }
  }, [isOpen])

  if (!isOpen) return null

  const sizeClass = SIZES[size] || SIZES.md

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? 'modal-title' : undefined}
    >
      <div
        ref={modalRef}
        className={`
          bg-white rounded-xl shadow-2xl w-full ${sizeClass}
          transition-all duration-200 ease-out
          animate-in fade-in zoom-in-95
          ${className}
        `}
        onClick={(e) => e.stopPropagation()}
        tabIndex={-1}
      >
        {/* Header */}
        {(title || (showCloseButton && onClose)) && (
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
            {title && (
              <h2 
                id="modal-title" 
                className="text-lg font-semibold text-gray-900"
              >
                {title}
              </h2>
            )}
            {!title && <div />}
            {showCloseButton && onClose && (
              <button
                onClick={onClose}
                className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors"
                aria-label="Close modal"
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            )}
          </div>
        )}

        {/* Content */}
        <div className="px-6 py-4">
          {children}
        </div>
      </div>
    </div>
  )
}

Modal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func,
  title: PropTypes.string,
  size: PropTypes.oneOf(['sm', 'md', 'lg', 'xl', '2xl', 'full']),
  children: PropTypes.node.isRequired,
  showCloseButton: PropTypes.bool,
  className: PropTypes.string,
}
