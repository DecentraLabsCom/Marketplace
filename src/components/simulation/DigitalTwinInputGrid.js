'use client'

import { useEffect, useRef, useState } from 'react'
import PropTypes from 'prop-types'
import DigitalTwinInput from './DigitalTwinInput'
import { normalizeFmiLsStruct } from '@/utils/fmiLsStruct'
import { fromVariableDisplayValue, getVariableValueCount, toVariableDisplayValue } from './simulationParameters'

function arrayValues(value) {
  if (Array.isArray(value)) return value.flat(Infinity)
  if (typeof value === 'string' && /[\s,]/.test(value.trim())) return value.trim().split(/[\s,]+/).filter(Boolean)
  return value === undefined || value === null || value === '' ? [] : [value]
}

function FmiLsStructMemberInput({ member, variable, modelVariables, value, onChange, disabled }) {
  const valueCount = getVariableValueCount(variable, modelVariables)
  const isArray = valueCount > 1 && valueCount <= 128
  if (!isArray) {
    return (
      <div title={`${member.memberName} · ${member.variableKind}`}>
        <DigitalTwinInput variable={variable} modelVariables={modelVariables} value={value} onChange={onChange} disabled={disabled} />
      </div>
    )
  }

  const currentValues = arrayValues(value ?? variable.start)
  const rows = Array.from({ length: valueCount }, (_, index) => currentValues[index] ?? '')
  const numeric = /^(Real|Float32|Float64|Integer|Enumeration|Int8|UInt8|Int16|UInt16|Int32|UInt32|Int64|UInt64)$/i.test(variable.type || '')
  const boolean = String(variable.type || '').toLowerCase() === 'boolean'
  const integer = /^(Integer|Enumeration|Int8|UInt8|Int16|UInt16|Int32|UInt32|Int64|UInt64)$/i.test(variable.type || '')

  function updateElement(index, rawValue) {
    const next = [...rows]
    if (boolean) next[index] = rawValue
    else if (rawValue === '') next[index] = ''
    else next[index] = numeric ? fromVariableDisplayValue(variable, Number(rawValue)) : rawValue
    onChange(variable.name, next)
  }

  return (
    <section className="min-w-0 rounded-xl border border-[#26383f] bg-[#142128] p-3" title={`${member.memberName} · ${member.variableKind}`}>
      <div className="mb-2 flex min-w-0 items-baseline justify-between gap-2">
        <span className="truncate text-xs font-semibold text-white" title={variable.displayName || member.memberName}>
          {variable.displayName || member.memberName}
        </span>
        <span className="shrink-0 text-[10px] text-[#829ba1]">{valueCount} values</span>
      </div>
      <div className="max-h-52 overflow-y-auto rounded-lg border border-[#26383f]">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-[#0c171c] text-[#829ba1]">
            <tr><th className="w-14 px-2 py-1.5 text-left font-medium">Index</th><th className="px-2 py-1.5 text-left font-medium">Value</th></tr>
          </thead>
          <tbody>
            {rows.map((item, index) => {
              const displayed = numeric ? toVariableDisplayValue(variable, item) : item
              return (
                <tr key={index} className="border-t border-[#26383f]">
                  <td className="px-2 py-1 font-mono text-[#829ba1]">{index}</td>
                  <td className="px-2 py-1">
                    {boolean ? (
                      <input
                        type="checkbox"
                        aria-label={`${variable.name} element ${index + 1}`}
                        checked={item === true || String(item).toLowerCase() === 'true'}
                        onChange={(event) => updateElement(index, event.target.checked)}
                        disabled={disabled}
                        className="h-4 w-4 accent-[#54d5c9]"
                      />
                    ) : (
                      <input
                        type={numeric ? 'number' : 'text'}
                        step={numeric && !integer ? 'any' : undefined}
                        aria-label={`${variable.name} element ${index + 1}`}
                        value={displayed ?? ''}
                        onChange={(event) => updateElement(index, event.target.value)}
                        disabled={disabled}
                        className="w-full rounded border border-[#26383f] bg-[#0c171c] px-2 py-1 text-sm text-white focus:border-[#54d5c9] focus:outline-none disabled:opacity-40"
                      />
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}

FmiLsStructMemberInput.propTypes = {
  member: PropTypes.object.isRequired,
  variable: PropTypes.object.isRequired,
  modelVariables: PropTypes.arrayOf(PropTypes.object).isRequired,
  value: PropTypes.any,
  onChange: PropTypes.func.isRequired,
  disabled: PropTypes.bool,
}

export default function DigitalTwinInputGrid({
  variables,
  modelVariables,
  values,
  onChange,
  disabled = false,
  emptyMessage,
  maxVisibleRows = 0,
  fmiLsStruct,
}) {
  const gridRef = useRef(null)
  const [maxHeight, setMaxHeight] = useState(null)

  useEffect(() => {
    if (!maxVisibleRows) return undefined

    const grid = gridRef.current
    if (!grid) return undefined

    const updateMaxHeight = () => {
      const gridBounds = grid.getBoundingClientRect()
      const items = Array.from(grid.children)
        .map((item) => item.getBoundingClientRect())
        .sort((left, right) => left.top - right.top)
      const rows = []

      for (const item of items) {
        const row = rows[rows.length - 1]
        if (!row || Math.abs(row.top - item.top) > 1) {
          rows.push({ top: item.top, bottom: item.bottom })
        } else {
          row.bottom = Math.max(row.bottom, item.bottom)
        }
      }

      const visibleRow = rows[Math.min(rows.length, maxVisibleRows) - 1]
      if (!visibleRow) return

      const contentHeight = Math.ceil(visibleRow.bottom - gridBounds.top)
      const viewportLimit = Math.min(window.innerHeight * 0.55, 280)
      setMaxHeight(Math.min(contentHeight, viewportLimit))
    }

    updateMaxHeight()
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(updateMaxHeight)
    observer?.observe(grid)
    Array.from(grid.children).forEach((item) => observer?.observe(item))
    window.addEventListener('resize', updateMaxHeight)

    return () => {
      observer?.disconnect()
      window.removeEventListener('resize', updateMaxHeight)
    }
  }, [fmiLsStruct, maxVisibleRows, variables])

  if (variables.length === 0) {
    return emptyMessage ? (
      <p className="rounded-lg border border-[#26383f] bg-[#0c171c] px-3 py-2 text-xs text-[#829ba1]">
        {emptyMessage}
      </p>
    ) : null
  }

  const metadata = normalizeFmiLsStruct(
    fmiLsStruct,
    new Set(modelVariables.map((variable) => variable?.name).filter(Boolean)),
  )
  const inputVariables = new Map(variables.map((variable) => [variable.name, variable]))
  const mappedNames = new Set()
  const mapGroups = (metadata?.maps || []).map((map) => {
    const members = map.members.flatMap((member) => {
      const variable = inputVariables.get(member.variableName)
      if (!variable || mappedNames.has(variable.name)) return []
      mappedNames.add(variable.name)
      return [{ variable, member }]
    })
    return { ...map, members }
  }).filter((map) => map.members.length > 0)
  const renderInput = (variable) => (
    <DigitalTwinInput
      key={variable.name}
      variable={variable}
      modelVariables={modelVariables}
      value={values[variable.name]}
      onChange={onChange}
      disabled={disabled}
    />
  )
  const grid = (
    <div ref={gridRef} className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {mapGroups.map((map) => (
        <section key={map.name} className="col-span-full rounded-xl border border-[#315057] bg-[#101a20] p-3">
          <h4 className="mb-2 text-xs font-semibold text-[#b6fff2]">
            {map.name}
            <span className="ml-2 font-normal text-[#829ba1]">
              {map.terminalKind.endsWith('.irregular') ? 'Irregular grid' : 'Rectilinear grid'}
            </span>
          </h4>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {map.members.map(({ variable, member }) => (
              <FmiLsStructMemberInput
                key={variable.name}
                member={member}
                variable={variable}
                modelVariables={modelVariables}
                value={values[variable.name]}
                onChange={onChange}
                disabled={disabled}
              />
            ))}
          </div>
        </section>
      ))}
      {variables.filter((variable) => !mappedNames.has(variable.name)).map(renderInput)}
    </div>
  )

  if (!maxVisibleRows) return grid

  return (
    <div
      className="max-h-[min(55vh,17.5rem)] overflow-y-auto overscroll-contain pr-2"
      style={maxHeight === null ? undefined : { maxHeight }}
    >
      {grid}
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
  maxVisibleRows: PropTypes.number,
  fmiLsStruct: PropTypes.object,
}
