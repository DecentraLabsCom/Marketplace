'use client'

import { cloneElement, useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import PropTypes from 'prop-types'
import { getVariableDescription } from '../utils/simulationParameters'

export default function VariableDescriptionTooltip({ name, description, align = 'right', portal = false, positionKey, children }) {
  const tooltipId = useId()
  const triggerRef = useRef(null)
  const tooltipRef = useRef(null)
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)
  const [position, setPosition] = useState(null)
  const [positionRevision, setPositionRevision] = useState(0)
  const helpText = getVariableDescription({ name, description })
  const usesPortal = portal || Boolean(children)
  const portalOpen = usesPortal && (hovered || focused)

  useEffect(() => {
    if (!portalOpen) return undefined

    const updatePosition = () => {
      const trigger = triggerRef.current
      const tooltip = tooltipRef.current
      if (!trigger || !tooltip) return

      const triggerBounds = trigger.getBoundingClientRect()
      const tooltipWidth = tooltip.offsetWidth
      const tooltipHeight = tooltip.offsetHeight
      const margin = 12
      const preferredLeft = align === 'left'
        ? triggerBounds.left
        : triggerBounds.right - tooltipWidth
      const left = Math.max(margin, Math.min(preferredLeft, window.innerWidth - tooltipWidth - margin))
      const preferredTop = triggerBounds.bottom + 8
      const top = preferredTop + tooltipHeight <= window.innerHeight - margin
        ? preferredTop
        : Math.max(margin, triggerBounds.top - tooltipHeight - 8)
      setPosition({ left, top })
    }

    updatePosition()
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)
    return () => {
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
    }
  }, [align, portalOpen, positionKey, positionRevision])

  const handleMouseEnter = () => {
    setPosition(null)
    setPositionRevision((revision) => revision + 1)
    setHovered(true)
  }

  const handleMouseMove = () => {
    // Reordering keyed indicator cards can move a card under the pointer without
    // producing a new mouseenter event. Recover the hover state on the next move.
    if (!hovered) {
      setPosition(null)
      setPositionRevision((revision) => revision + 1)
      setHovered(true)
    }
  }

  const handleFocus = (event) => {
    setPosition(null)
    setPositionRevision((revision) => revision + 1)
    setFocused(event.target.matches(':focus-visible'))
  }

  if (!helpText) return children || null

  const tooltip = (
    <span
      id={tooltipId}
      ref={usesPortal ? tooltipRef : undefined}
      role="tooltip"
      className={usesPortal
        ? 'pointer-events-none fixed z-1000 max-h-[70vh] w-64 max-w-[calc(100vw-1.5rem)] overflow-y-auto rounded-lg border border-[#54747b] bg-[#071014] p-3 text-left text-xs font-normal leading-relaxed text-[#e5f0f2] shadow-xl'
        : `pointer-events-auto invisible absolute top-full z-50 w-64 whitespace-normal rounded-lg border border-[#54747b] bg-[#071014] p-3 text-left text-xs font-normal leading-relaxed text-[#e5f0f2] opacity-0 shadow-xl transition-opacity group-hover:visible group-hover:opacity-100 group-focus-visible:visible group-focus-visible:opacity-100 ${align === 'left' ? 'left-0' : 'right-0'}`}
      style={usesPortal ? {
        left: position?.left ?? 0,
        top: position?.top ?? 0,
        visibility: position ? 'visible' : 'hidden',
      } : undefined}
    >
      <span className="mb-1 block wrap-break-word text-[10px] font-semibold uppercase tracking-[0.12em] text-[#67d7cf]">{name}</span>
      <span className="block wrap-break-word">{helpText}</span>
    </span>
  )

  if (children) {
    const describedBy = [children.props['aria-describedby'], portalOpen ? tooltipId : null]
      .filter(Boolean)
      .join(' ')
    const child = cloneElement(children, {
      ref: triggerRef,
      'aria-describedby': describedBy || undefined,
      onMouseEnter: (event) => {
        children.props.onMouseEnter?.(event)
        handleMouseEnter(event)
      },
      onMouseMove: (event) => {
        children.props.onMouseMove?.(event)
        handleMouseMove(event)
      },
      onMouseLeave: (event) => {
        children.props.onMouseLeave?.(event)
        setHovered(false)
      },
      onFocus: (event) => {
        children.props.onFocus?.(event)
        handleFocus(event)
      },
      onBlur: (event) => {
        children.props.onBlur?.(event)
        if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false)
      },
    })

    return (
      <>
        {child}
        {portalOpen && typeof document !== 'undefined' ? createPortal(tooltip, document.body) : null}
      </>
    )
  }

  return (
    <button
      ref={triggerRef}
      type="button"
      aria-describedby={usesPortal ? (portalOpen ? tooltipId : undefined) : tooltipId}
      aria-label={`${name} description: ${helpText}`}
      onMouseEnter={usesPortal ? handleMouseEnter : undefined}
      onMouseMove={usesPortal ? handleMouseMove : undefined}
      onMouseLeave={usesPortal ? () => setHovered(false) : undefined}
      onFocus={usesPortal ? handleFocus : undefined}
      onBlur={usesPortal ? () => setFocused(false) : undefined}
      className="group relative grid h-4 w-4 shrink-0 place-items-center rounded-full border border-[#5c7e84] text-[10px] font-semibold leading-none text-[#a9c3c7] hover:border-[#54d5c9] hover:text-[#d8fffa] focus-visible:ring-2 focus-visible:ring-[#54d5c9]"
    >
      <span aria-hidden="true">?</span>
      {usesPortal
        ? (portalOpen && typeof document !== 'undefined' ? createPortal(tooltip, document.body) : null)
        : tooltip}
    </button>
  )
}

VariableDescriptionTooltip.propTypes = {
  name: PropTypes.string.isRequired,
  description: PropTypes.string,
  align: PropTypes.oneOf(['left', 'right']),
  portal: PropTypes.bool,
  positionKey: PropTypes.any,
  children: PropTypes.element,
}
