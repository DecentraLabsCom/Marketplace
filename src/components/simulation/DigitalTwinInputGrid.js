'use client'

import PropTypes from 'prop-types'
import DigitalTwinInput from './DigitalTwinInput'

export default function DigitalTwinInputGrid({
  variables,
  modelVariables,
  values,
  onChange,
  disabled = false,
  emptyMessage,
}) {
  if (variables.length === 0) {
    return emptyMessage ? (
      <p className="rounded-lg border border-[#26383f] bg-[#0c171c] px-3 py-2 text-xs text-[#829ba1]">
        {emptyMessage}
      </p>
    ) : null
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {variables.map((variable) => (
        <DigitalTwinInput
          key={variable.name}
          variable={variable}
          modelVariables={modelVariables}
          value={values[variable.name]}
          onChange={onChange}
          disabled={disabled}
        />
      ))}
    </div>
  )
}

DigitalTwinInputGrid.propTypes = {
  variables: PropTypes.arrayOf(PropTypes.object).isRequired,
  modelVariables: PropTypes.arrayOf(PropTypes.object).isRequired,
  values: PropTypes.object.isRequired,
  onChange: PropTypes.func.isRequired,
  disabled: PropTypes.bool,
  emptyMessage: PropTypes.string,
}
