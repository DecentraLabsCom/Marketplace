"use client";

import React from 'react'
import PropTypes from 'prop-types'
import {
  formatVariableDisplayValue,
  fromVariableDisplayValue,
  getVariableDisplayName,
  getVariableDisplayUnit,
  getVariableInputDetails,
} from './simulationParameters'
import VariableDescriptionTooltip from './VariableDescriptionTooltip'
import { normalizeFmiLsStruct } from '@/utils/fmiLsStruct'

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
  fmiLsStruct,
  values,
  onChange,
  disabled = false,
}) {
  if (!variables?.length) return null

  const metadata = normalizeFmiLsStruct(
    fmiLsStruct,
    new Set(modelVariables.map((variable) => variable?.name).filter(Boolean)),
  )
  const variablesByName = new Map(variables.map((variable) => [variable.name, variable]))
  const mappedNames = new Set()
  const groups = (metadata?.maps || []).flatMap((map) => {
    const members = map.members.flatMap((member) => {
      const variable = variablesByName.get(member.variableName)
      if (!variable || mappedNames.has(variable.name)) return []
      mappedNames.add(variable.name)
      return [variable]
    })
    return members.length > 0 ? [{ name: map.name, terminalKind: map.terminalKind, variables: members }] : []
  })
  const unmappedVariables = variables.filter((variable) => !mappedNames.has(variable.name))

  const renderVariableRow = (variable) => {
    const details = getVariableInputDetails(variable, modelVariables)
    const displayName = getVariableDisplayName(variable)
    const displayUnit = getVariableDisplayUnit(variable)
    const hintId = `parameter-hint-${String(variable.name).replace(/[^a-zA-Z0-9_-]/g, '-')}`

    return (
      <tr key={variable.name} className="border-t border-[#2a2f33]">
        <td className="px-3 py-2 text-neutral-200 text-xs align-top">
          <div className="flex items-center gap-2">
            <div className="font-mono" title={variable.name}>{displayName}</div>
            <VariableDescriptionTooltip name={variable.name} description={variable.description} align="left" />
          </div>
          <p className="text-text-secondary mt-1">{details.summary}</p>
        </td>
        <td className="px-3 py-2 align-top">
          {details.inputType === 'select' ? (
            <select
              value={String(values[variable.name] ?? '')}
              onChange={(event) => onChange(variable.name, Number(event.target.value))}
              disabled={disabled}
              className="w-full bg-[#1f2426] border border-[#2a2f33] rounded px-2 py-1 text-neutral-200 text-xs focus:outline-none focus:border-brand disabled:opacity-50 disabled:cursor-not-allowed"
              aria-label={`Parameter ${displayName}`}
              aria-describedby={hintId}
            >
              {details.enumItems.map((item) => (
                <option key={item.value} value={item.value} title={item.description || undefined}>
                  {item.description || item.name}
                </option>
              ))}
            </select>
          ) : (
            <input
              type={details.inputType}
              step={details.step}
              min={details.min}
              max={details.max}
              value={formatVariableDisplayValue(variable, values[variable.name])}
              onChange={(event) => onChange(variable.name, fromVariableDisplayValue(variable, event.target.value))}
              disabled={disabled}
              placeholder={details.valueCount > 1 ? details.format.replace('Format: ', '') : undefined}
              className="w-full bg-[#1f2426] border border-[#2a2f33] rounded px-2 py-1 text-neutral-200 text-xs focus:outline-none focus:border-brand disabled:opacity-50 disabled:cursor-not-allowed"
              aria-label={`Parameter ${displayName}`}
              aria-describedby={hintId}
            />
          )}
          <div id={hintId} className="text-text-secondary text-xs mt-1 space-y-0.5">
            {details.inputType !== 'select' && <p>{details.format}</p>}
            {details.range && <p>{details.range}</p>}
          </div>
        </td>
        <td className="px-3 py-2 text-text-secondary text-xs align-top">{displayUnit || '—'}</td>
      </tr>
    )
  }

  return (
    <div>
      <h3 className="text-sm font-semibold text-header-bg mb-2">Input Parameters</h3>
      <div className="rounded-lg border border-[#2a2f33]">
        <table className="w-full text-sm">
          <thead className="bg-[#181b1d]">
            <tr>
              <th className="first:rounded-tl-lg text-left px-3 py-2 text-text-secondary font-medium">Variable</th>
              <th className="text-left px-3 py-2 text-text-secondary font-medium">Value</th>
              <th className="last:rounded-tr-lg text-left px-3 py-2 text-text-secondary font-medium">Unit</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((group) => (
              <React.Fragment key={group.name}>
                <tr className="border-t border-[#2a2f33] bg-[#181b1d]">
                  <th colSpan={3} className="px-3 py-2 text-left text-xs font-semibold text-[#67d7cf]">
                    {group.name}
                    <span className="ml-2 font-normal text-text-secondary">
                      {group.terminalKind.endsWith('.irregular') ? 'Irregular grid' : 'Rectilinear grid'}
                    </span>
                  </th>
                </tr>
                {group.variables.map(renderVariableRow)}
              </React.Fragment>
            ))}
            {unmappedVariables.map(renderVariableRow)}
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
  fmiLsStruct: PropTypes.object,
  values: PropTypes.object.isRequired,
  onChange: PropTypes.func.isRequired,
  disabled: PropTypes.bool,
}
