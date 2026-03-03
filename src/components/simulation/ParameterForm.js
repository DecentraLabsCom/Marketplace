"use client";
import React from 'react'
import PropTypes from 'prop-types'

/**
 * ParameterForm — editable table of FMU input variables.
 *
 * @param {Object} props
 * @param {Array} props.variables  - Array of model variable descriptors (name, causality, start, unit …)
 * @param {Object} props.values    - Current parameter values keyed by variable name
 * @param {Function} props.onChange - (name, value) => void
 * @param {boolean} [props.disabled]
 */
export default function ParameterForm({ variables, values, onChange, disabled = false }) {
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
            {variables.map((v) => (
              <tr key={v.name} className="border-t border-[#2a2f33]">
                <td className="px-3 py-2 text-neutral-200 font-mono text-xs">{v.name}</td>
                <td className="px-3 py-2">
                  <input
                    type="number"
                    step="any"
                    value={values[v.name] ?? ''}
                    onChange={(e) => onChange(v.name, e.target.value)}
                    disabled={disabled}
                    className="w-full bg-[#1f2426] border border-[#2a2f33] rounded px-2 py-1 text-neutral-200 text-xs
                      focus:outline-none focus:border-brand disabled:opacity-50 disabled:cursor-not-allowed"
                    aria-label={`Parameter ${v.name}`}
                  />
                </td>
                <td className="px-3 py-2 text-text-secondary text-xs">{v.unit || '—'}</td>
              </tr>
            ))}
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
      start: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
      unit: PropTypes.string,
    })
  ).isRequired,
  values: PropTypes.object.isRequired,
  onChange: PropTypes.func.isRequired,
  disabled: PropTypes.bool,
}
