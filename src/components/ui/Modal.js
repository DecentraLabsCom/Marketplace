/**
 * Generic Modal Component
 * 
 * Reusable modal dialog with customizable content, title, and size.
 * Supports keyboard (Escape) and click-outside to close.
 * 
 * @module components/ui/Modal
 */

"use client";

import { useEffect, useId, useRef } from 'react'
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
 * Theme variants for the modal
 * @readonly
 * @enum {Object}
 */
const THEMES = {
  light: {
    bg: 'bg-white',
    border: 'border-gray-100',
    title: 'text-gray-900',
    closeBtn: 'text-gray-400 hover:text-gray-600 hover:bg-gray-100',
  },
  dark: {
    bg: 'bg-[color:var(--color-background-surface)]',
    border: 'border-[color:var(--color-ui-label-medium)]',
    title: 'text-[color:var(--color-text-inverse)]',
    closeBtn: 'text-[color:var(--color-text-secondary)] hover:text-[color:var(--color-text-inverse)] hover:bg-[color:var(--color-background-dark)]',
  },
}

/**
 * Generic Modal component
 * 
 * @param {Object} props - Component props
 * @param {boolean} props.isOpen - Whether the modal is visible
 * @param {function} [props.onClose] - Handler for closing the modal (if not provided, modal cannot be closed)
 * @param {string} [props.title] - Optional title displayed in header
 * @param {string} [props.size='md'] - Modal size: 'sm', 'md', 'lg', 'xl', '2xl', 'full'
 * @param {string} [props.theme='light'] - Modal theme: 'light' or 'dark'
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
  theme = 'light',
  children,
  showCloseButton = true,
  className = '',
}) {
  const modalRef = useRef(null)
  const previousFocusRef = useRef(null)
  const onCloseRef = useRef(onClose)
  const titleId = useId()

  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  // Handle Escape, trap focus, and restore the trigger focus on close.
  useEffect(() => {
    if (!isOpen) return undefined

    previousFocusRef.current = document.activeElement
    const modal = modalRef.current
    const focusableSelector = [
      'a[href]',
      'area[href]',
      'button:not([disabled])',
      'input:not([disabled])',
      'select:not([disabled])',
      'textarea:not([disabled])',
      '[tabindex]:not([tabindex="-1"])',
    ].join(',')

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (onCloseRef.current) onCloseRef.current()
        return
      }

      if (e.key !== 'Tab' || !modal) return

      const focusable = Array.from(modal.querySelectorAll(focusableSelector))
      if (focusable.length === 0) {
        e.preventDefault()
        modal.focus()
        return
      }

      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      if (previousFocusRef.current instanceof HTMLElement) {
        previousFocusRef.current.focus()
      }
    }
  }, [isOpen])

  // Lock body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [isOpen])

  // Focus the dialog container when there are no immediate controls.
  useEffect(() => {
    if (isOpen && modalRef.current) {
      modalRef.current.focus()
    }
  }, [isOpen])

  if (!isOpen) return null

  const sizeClass = SIZES[size] || SIZES.md
  const themeStyles = THEMES[theme] || THEMES.light

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-3 backdrop-blur-sm transition-opacity starting:opacity-0 opacity-100 sm:items-center sm:p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? titleId : undefined}
    >
      <div
        ref={modalRef}
        className={`
          my-auto flex max-h-[calc(100dvh-1.5rem)] w-full flex-col rounded-xl ${themeStyles.bg} shadow-2xl sm:max-h-[calc(100dvh-2rem)] ${sizeClass}
          transition-all duration-200 ease-out
          animate-in fade-in zoom-in-95
          starting:opacity-0 starting:translate-y-4 opacity-100 translate-y-0
          ${className}
        `}
        onClick={(e) => e.stopPropagation()}
        tabIndex={-1}
      >
        {/* Header */}
        {(title || (showCloseButton && onClose)) && (
          <div className={`flex items-center justify-between border-b ${themeStyles.border} px-4 py-3 sm:px-6 sm:py-4`}>
            {title && (
              <h2 
                id={titleId}
                className={`text-lg font-semibold ${themeStyles.title}`}
              >
                {title}
              </h2>
            )}
            {!title && <div />}
            {showCloseButton && onClose && (
              <button
                onClick={onClose}
                className={`p-1 ${themeStyles.closeBtn} rounded-full transition-colors`}
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
        <div className="overflow-y-auto px-4 py-3 sm:px-6 sm:py-4">
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
  theme: PropTypes.oneOf(['light', 'dark']),
  children: PropTypes.node.isRequired,
  showCloseButton: PropTypes.bool,
  className: PropTypes.string,
}
