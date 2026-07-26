"use client";

import React from 'react'
import PropTypes from 'prop-types'
import { formatParameterValue, getVariableInputDetails } from './simulationParameters'

/**
 * Editable table of FMU input variables.
 *
 * @param {Object} props
 * @param {Array} props.variables Array of input variable descriptors
 * @param {Array} [props.modelVariables] All model variable descriptors, used to resolve dimensions
 * @param {Object} props.values Current parameter values keyed by variable name
 * @param {Function} props.onChange (name, value) => void
 * @param {boolean} [props.disabled]
 */
export default function ParameterForm({
  variables,
  modelVariables = variables,
  values,
  onChange,
  disabled = false,
}) {
  if (!variables?.length) return null

  return (
    <div>
      <h3 className="text-sm font-semibold text-header-bg mb-2">Input Parameters</h3>
      <div className="rounded-lg border border-[#2a2f33] overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-[#181b1d]">
            <tr>
              <th className="text-left px-3 py-2 text-text-secondary font-medium">Variable</th>
              <th className="text-left px-3 py-2 text-text-secondary font-medium">Value</th>
              <th className="text-left px-3 py-2 text-text-secondary font-medium">Unit</th>
            </tr>
          </thead>
          <tbody>
            {variables.map((variable) => {
              const details = getVariableInputDetails(variable, modelVariables)
              const hintId = `parameter-hint-${String(variable.name).replace(/[^a-zA-Z0-9_-]/g, '-')}`

              return (
                <tr key={variable.name} className="border-t border-[#2a2f33]">
                  <td className="px-3 py-2 text-neutral-200 text-xs align-top">
                    <div className="font-mono">{variable.name}</div>
                    <p className="text-text-secondary mt-1">{details.summary}</p>
                    {variable.description && (
                      <p className="text-text-secondary mt-1">{variable.description}</p>
                    )}
                  </td>
                  <td className="px-3 py-2 align-top">
                    <input
                      type={details.inputType}
                      step={details.valueCount > 1 ? undefined : 'any'}
                      value={formatParameterValue(values[variable.name])}
                      onChange={(event) => onChange(variable.name, event.target.value)}
                      disabled={disabled}
                      placeholder={details.valueCount > 1 ? details.format.replace('Format: ', '') : undefined}
                      className="w-full bg-[#1f2426] border border-[#2a2f33] rounded px-2 py-1 text-neutral-200 text-xs
                        focus:outline-none focus:border-brand disabled:opacity-50 disabled:cursor-not-allowed"
                      aria-label={`Parameter ${variable.name}`}
                      aria-describedby={hintId}
                    />
                    <div id={hintId} className="text-text-secondary text-xs mt-1 space-y-0.5">
                      <p>{details.format}</p>
                      {details.initial && <p>{details.initial}</p>}
                      {details.range && <p>{details.range}</p>}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-text-secondary text-xs align-top">{variable.unit || '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

ParameterForm.propTypes = {
  variables: PropTypes.arrayOf(
    PropTypes.shape({
      name: PropTypes.string.isRequired,
      causality: PropTypes.string,
      type: PropTypes.string,
      description: PropTypes.string,
      start: PropTypes.oneOfType([
        PropTypes.string,
        PropTypes.number,
        PropTypes.arrayOf(PropTypes.oneOfType([PropTypes.string, PropTypes.number])),
      ]),
      min: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
      max: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
      unit: PropTypes.string,
      dimensions: PropTypes.array,
    })
  ).isRequired,
  modelVariables: PropTypes.array,
  values: PropTypes.object.isRequired,
  onChange: PropTypes.func.isRequired,
  disabled: PropTypes.bool,
}
