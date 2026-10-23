'use client'

import { useId } from 'react'
import PropTypes from 'prop-types'
import { getVariableDescription } from './simulationParameters'

export default function VariableDescriptionTooltip({ name, description, align = 'right' }) {
  const tooltipId = useId()
  const helpText = getVariableDescription({ name, description })
  if (!helpText) return null

  return (
    <button
      type="button"
      aria-describedby={tooltipId}
      aria-label={`${name} description: ${helpText}`}
      className="group relative grid h-4 w-4 shrink-0 place-items-center rounded-full border border-[#5c7e84] text-[10px] font-semibold leading-none text-[#a9c3c7] hover:border-[#54d5c9] hover:text-[#d8fffa] focus-visible:ring-2 focus-visible:ring-[#54d5c9]"
    >
      <span aria-hidden="true">?</span>
      <span
        id={tooltipId}
        role="tooltip"
        className={`pointer-events-auto invisible absolute top-full z-50 w-64 whitespace-normal rounded-lg border border-[#54747b] bg-[#071014] p-3 text-left text-xs font-normal leading-relaxed text-[#e5f0f2] opacity-0 shadow-xl transition-opacity group-hover:visible group-hover:opacity-100 group-focus-visible:visible group-focus-visible:opacity-100 ${align === 'left' ? 'left-0' : 'right-0'}`}
      >
        {helpText}
      </span>
    </button>
  )
}

VariableDescriptionTooltip.propTypes = {
  name: PropTypes.string.isRequired,
  description: PropTypes.string,
  align: PropTypes.oneOf(['left', 'right']),
}
