'use client'

import { useId } from 'react'
import PropTypes from 'prop-types'
import { ChevronDown } from 'lucide-react'
import VariableDescriptionTooltip from './VariableDescriptionTooltip'

export default function ExecutionPaceSelector({
  executionPace = 'realtime',
  onChange,
  disabled = false,
  toolbar = false,
}) {
  const controlId = useId()
  const optionName = executionPace === 'realtime' ? 'Real time (1x)' : 'Fastest'
  const description = executionPace === 'realtime'
    ? 'Targets one simulation second per real second.'
    : 'Runs as quickly as the model and connection allow.'

  return (
    <div className={toolbar ? 'w-full min-w-0' : 'grid gap-2'}>
      {toolbar ? (
        <div className="flex min-h-10 w-full min-w-0 items-center gap-2 rounded-lg border border-[#30464d] bg-[#142128] px-3 text-xs text-[#a9bec2] transition focus-within:border-[#54d5c9] focus-within:ring-2 focus-within:ring-[#54d5c9]/30">
          <VariableDescriptionTooltip name={optionName} description={description}>
            <label htmlFor={controlId} className="shrink-0 cursor-help">Pace</label>
          </VariableDescriptionTooltip>
          <span className="relative inline-flex min-h-8 min-w-0 flex-1 items-center">
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
              className="h-8 min-w-0 w-full appearance-none border-0 bg-transparent py-0 pl-1 pr-6 text-xs font-semibold text-[#f1f7f8] shadow-none outline-none ring-0 focus:border-transparent focus:outline-none focus:ring-0 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <option value="realtime" className="bg-[#101a20] text-[#f1f7f8]">Real time (1x)</option>
              <option value="fastest" className="bg-[#101a20] text-[#f1f7f8]">Fastest</option>
            </select>
            <ChevronDown size={14} aria-hidden="true" className="pointer-events-none absolute right-1 text-[#9ab8bd]" />
          </span>
        </div>
      ) : (
        <>
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
        </>
      )}
    </div>
  )
}

ExecutionPaceSelector.propTypes = {
  executionPace: PropTypes.oneOf(['fastest', 'realtime']),
  onChange: PropTypes.func.isRequired,
  disabled: PropTypes.bool,
  toolbar: PropTypes.bool,
}
