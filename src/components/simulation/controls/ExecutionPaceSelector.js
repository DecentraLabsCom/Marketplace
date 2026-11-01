'use client'

import { useId } from 'react'
import PropTypes from 'prop-types'
import { ChevronDown } from 'lucide-react'
import VariableDescriptionTooltip from './VariableDescriptionTooltip'

export default function ExecutionPaceSelector({ executionPace = 'realtime', onChange, disabled = false }) {
  const controlId = useId()
  const optionName = executionPace === 'realtime' ? 'Real time (1x)' : 'Fastest'
  const description = executionPace === 'realtime'
    ? 'Targets one simulation second per real second.'
    : 'Runs as quickly as the model and connection allow.'

  return (
    <div className="grid gap-2">
      <VariableDescriptionTooltip name={optionName} description={description}>
        <label htmlFor={controlId} className="block cursor-help text-xs font-semibold text-[#dce9e9]">Pace</label>
      </VariableDescriptionTooltip>
      <span className="relative block">
        <select
          id={controlId}
          aria-label="Pace"
          value={executionPace}
          onChange={(event) => onChange(event.target.value)}
          disabled={disabled}
          style={{
            colorScheme: 'dark',
            appearance: 'none',
            WebkitAppearance: 'none',
            MozAppearance: 'none',
            backgroundImage: 'none',
          }}
          className="h-10 w-full appearance-none rounded-lg border border-[#30464d] bg-[#142128] px-3 pr-9 text-sm font-semibold text-[#f1f7f8] outline-none transition focus:border-[#54d5c9] focus:ring-2 focus:ring-[#54d5c9]/30 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <option value="realtime" className="bg-[#101a20] text-[#f1f7f8]">Real time (1x)</option>
          <option value="fastest" className="bg-[#101a20] text-[#f1f7f8]">Fastest</option>
        </select>
        <ChevronDown size={16} aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[#9ab8bd]" />
      </span>
    </div>
  )
}

ExecutionPaceSelector.propTypes = {
  executionPace: PropTypes.oneOf(['fastest', 'realtime']),
  onChange: PropTypes.func.isRequired,
  disabled: PropTypes.bool,
}
