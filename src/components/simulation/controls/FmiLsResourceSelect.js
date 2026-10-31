'use client'

import { createPortal } from 'react-dom'
import { useEffect, useId, useRef, useState } from 'react'
import PropTypes from 'prop-types'
import VariableDescriptionTooltip from './VariableDescriptionTooltip'

export default function FmiLsResourceSelect({
  options: suppliedOptions,
  selectedOptionId,
  onSelect,
  choiceLabel = 'System configuration',
  disabled = false,
  fitContent = false,
}) {
  const valueId = useId()
  const listboxId = useId()
  const rootRef = useRef(null)
  const triggerRef = useRef(null)
  const listboxRef = useRef(null)
  const [isOpen, setIsOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const [menuPosition, setMenuPosition] = useState(null)
  const customChoice = { id: '', name: choiceLabel, description: '' }
  const options = [customChoice, ...(Array.isArray(suppliedOptions) ? suppliedOptions : [])]
  const longestOptionName = options.reduce((longest, option) => (
    option.name.length > longest.length ? option.name : longest
  ), customChoice.name)
  const selectedIndex = Math.max(0, options.findIndex((option) => option.id === selectedOptionId))
  const selectedOption = options[selectedIndex] || customChoice

  useEffect(() => {
    if (!isOpen) return undefined

    const updateMenuPosition = () => {
      const trigger = triggerRef.current
      if (!trigger) return

      const bounds = trigger.getBoundingClientRect()
      const margin = 12
      const gap = 6
      const width = Math.min(Math.max(bounds.width, 220), window.innerWidth - margin * 2)
      const left = Math.max(margin, Math.min(bounds.left, window.innerWidth - width - margin))
      const spaceBelow = Math.max(0, window.innerHeight - bounds.bottom - margin - gap)
      const spaceAbove = Math.max(0, bounds.top - margin - gap)
      const showBelow = spaceBelow >= Math.min(220, options.length * 40) || spaceBelow >= spaceAbove
      const availableHeight = showBelow ? spaceBelow : spaceAbove
      const maxHeight = Math.max(80, Math.min(240, availableHeight))
      const top = showBelow
        ? bounds.bottom + gap
        : Math.max(margin, bounds.top - maxHeight - gap)

      setMenuPosition({ top, left, width, maxHeight })
    }

    updateMenuPosition()
    window.addEventListener('resize', updateMenuPosition)
    window.addEventListener('scroll', updateMenuPosition, true)
    return () => {
      window.removeEventListener('resize', updateMenuPosition)
      window.removeEventListener('scroll', updateMenuPosition, true)
    }
  }, [isOpen, options.length])

  useEffect(() => {
    if (!isOpen) return undefined

    const handleOutsidePointer = (event) => {
      if (rootRef.current?.contains(event.target) || listboxRef.current?.contains(event.target)) return
      setIsOpen(false)
      setMenuPosition(null)
    }

    document.addEventListener('pointerdown', handleOutsidePointer)
    return () => document.removeEventListener('pointerdown', handleOutsidePointer)
  }, [isOpen])

  useEffect(() => {
    if (!disabled || !isOpen) return
    setIsOpen(false)
    setMenuPosition(null)
  }, [disabled, isOpen])

  useEffect(() => {
    if (!isOpen || !menuPosition) return
    listboxRef.current?.querySelector(`[data-option-index="${activeIndex}"]`)?.focus()
  }, [activeIndex, isOpen, menuPosition])

  function openMenu() {
    setActiveIndex(selectedIndex)
    setMenuPosition(null)
    setIsOpen(true)
  }

  function closeMenu({ restoreFocus = false } = {}) {
    setIsOpen(false)
    setMenuPosition(null)
    if (restoreFocus) requestAnimationFrame(() => triggerRef.current?.focus())
  }

  function selectOption(option) {
    onSelect(option.id)
    closeMenu({ restoreFocus: true })
  }

  function handleTriggerKeyDown(event) {
    if (disabled || !['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) return
    event.preventDefault()
    if (isOpen) {
      listboxRef.current?.querySelector(`[data-option-index="${activeIndex}"]`)?.focus()
      return
    }
    openMenu()
  }

  function handleOptionKeyDown(event, index) {
    let nextIndex = index
    if (event.key === 'ArrowDown') nextIndex = Math.min(options.length - 1, index + 1)
    else if (event.key === 'ArrowUp') nextIndex = Math.max(0, index - 1)
    else if (event.key === 'Home') nextIndex = 0
    else if (event.key === 'End') nextIndex = options.length - 1
    else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      selectOption(options[index])
      return
    } else if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      closeMenu({ restoreFocus: true })
      return
    } else if (event.key === 'Tab') {
      const dialog = triggerRef.current?.closest('[role="dialog"][aria-modal="true"]')
      const focusScope = dialog || document
      const focusableElements = Array.from(focusScope.querySelectorAll(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )).filter((element) => element.tabIndex >= 0)
      const triggerIndex = focusableElements.indexOf(triggerRef.current)
      const targetIndex = triggerIndex + (event.shiftKey ? -1 : 1)
      if (triggerIndex >= 0 && focusableElements[targetIndex]) {
        event.preventDefault()
        event.stopPropagation()
        closeMenu()
        focusableElements[targetIndex].focus()
      } else {
        closeMenu()
      }
      return
    } else {
      return
    }

    event.preventDefault()
    setActiveIndex(nextIndex)
  }

  if (!Array.isArray(suppliedOptions) || suppliedOptions.length === 0) return null

  return (
    <div ref={rootRef} className={`relative gap-1 text-xs text-text-secondary ${fitContent ? 'inline-flex w-max min-w-0 max-w-full' : 'grid min-w-52'}`}>
      <button
        ref={triggerRef}
        type="button"
        aria-label={selectedOption.id ? `${choiceLabel}: ${selectedOption.name}` : choiceLabel}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={isOpen && menuPosition ? listboxId : undefined}
        onClick={() => (isOpen ? closeMenu() : openMenu())}
        onKeyDown={handleTriggerKeyDown}
        disabled={disabled}
        className={`inline-flex min-h-10 ${fitContent ? 'w-max min-w-0 max-w-full' : 'w-full'} items-center justify-between gap-3 rounded-lg border border-[#30464d] bg-[#142128] px-3 text-left text-xs font-semibold text-[#dce9e9] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#54d5c9] disabled:cursor-not-allowed disabled:opacity-50`}
      >
        {fitContent ? (
          <span className="grid min-w-0">
            <span id={valueId} className="col-start-1 row-start-1 truncate">{selectedOption.name}</span>
            <span aria-hidden="true" className="invisible col-start-1 row-start-1 whitespace-nowrap">{longestOptionName}</span>
          </span>
        ) : (
          <span id={valueId} className="truncate">{selectedOption.name}</span>
        )}
        <svg aria-hidden="true" viewBox="0 0 20 20" fill="currentColor" className={`h-4 w-4 shrink-0 text-[#9ab8bd] transition-transform ${isOpen ? 'rotate-180' : ''}`}>
          <path fillRule="evenodd" d="M5.22 7.22a.75.75 0 0 1 1.06 0L10 10.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 8.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
        </svg>
      </button>
      {isOpen && menuPosition && typeof document !== 'undefined' ? createPortal(
        <div
          ref={listboxRef}
          id={listboxId}
          role="listbox"
          aria-label={choiceLabel}
          data-fmi-ls-option-listbox="true"
          className="overflow-y-auto rounded-lg border border-[#36535a] bg-[#08181d] p-1 shadow-2xl"
          style={{
            position: 'fixed',
            top: menuPosition.top,
            left: menuPosition.left,
            width: menuPosition.width,
            maxHeight: menuPosition.maxHeight,
            zIndex: 990,
          }}
        >
          {options.map((option, index) => (
            <VariableDescriptionTooltip
              key={option.id || 'custom'}
              name={option.name}
              description={option.description}
            >
              <button
                type="button"
                role="option"
                aria-selected={index === selectedIndex}
                data-option-index={index}
                tabIndex={-1}
                onMouseEnter={() => setActiveIndex(index)}
                onFocus={() => setActiveIndex(index)}
                onKeyDown={(event) => handleOptionKeyDown(event, index)}
                onClick={() => selectOption(option)}
                className={`flex min-h-10 w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-left text-xs transition ${index === activeIndex ? 'bg-[#17353b] text-white' : 'text-[#c2d5d8] hover:bg-[#12272d] hover:text-white'}`}
              >
                <span className="wrap-break-word">{option.name}</span>
                {option.id === selectedOptionId ? <span aria-hidden="true" className="text-[#73e4cb]">✓</span> : null}
              </button>
            </VariableDescriptionTooltip>
          ))}
        </div>,
        document.body,
      ) : null}
    </div>
  )
}

FmiLsResourceSelect.propTypes = {
  options: PropTypes.arrayOf(PropTypes.shape({
    id: PropTypes.string.isRequired,
    name: PropTypes.string.isRequired,
    description: PropTypes.string,
    parameters: PropTypes.object.isRequired,
  })).isRequired,
  selectedOptionId: PropTypes.string.isRequired,
  onSelect: PropTypes.func.isRequired,
  choiceLabel: PropTypes.string,
  disabled: PropTypes.bool,
  fitContent: PropTypes.bool,
}
