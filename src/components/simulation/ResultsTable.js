"use client";
import React, { useMemo } from 'react'
import PropTypes from 'prop-types'

/**
 * ResultsTable — scrollable data table showing time + output columns.
 *
 * @param {Object} props
 * @param {Object} props.outputs - { varName: number[] }
 * @param {number[]} [props.time] - Time array
 */
export default function ResultsTable({ outputs, time }) {
  const columns = useMemo(() => {
    if (!outputs || typeof outputs !== 'object') return []
    return Object.keys(outputs)
  }, [outputs])

  const timeArr = useMemo(() => (Array.isArray(time) ? time : []), [time])
  const rowCount = useMemo(() => {
    const lens = columns.map(c => (outputs[c]?.length ?? 0))
    return Math.max(timeArr.length, ...lens, 0)
  }, [columns, outputs, timeArr])

  if (!columns.length) return null

  // Show a capped number of rows with a note
  const MAX_DISPLAY = 200
  const displayCount = Math.min(rowCount, MAX_DISPLAY)

  return (
    <div>
      <h4 className="text-sm font-semibold text-header-bg mb-2">
        Data Table {rowCount > MAX_DISPLAY && <span className="text-text-secondary font-normal">(showing first {MAX_DISPLAY} of {rowCount} rows)</span>}
      </h4>
      <div className="max-h-64 overflow-auto rounded-lg border border-[#2a2f33]">
        <table className="w-full text-xs">
          <thead className="bg-[#181b1d] sticky top-0">
            <tr>
              {timeArr.length > 0 && <th className="text-left px-2 py-1.5 text-text-secondary">Time</th>}
              {columns.map(c => (
                <th key={c} className="text-left px-2 py-1.5 text-text-secondary">{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: displayCount }, (_, i) => (
              <tr key={i} className="border-t border-[#2a2f33]">
                {timeArr.length > 0 && (
                  <td className="px-2 py-1 text-neutral-400 font-mono">{timeArr[i] ?? ''}</td>
                )}
                {columns.map(c => (
                  <td key={c} className="px-2 py-1 text-neutral-200 font-mono">{outputs[c]?.[i] ?? ''}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

ResultsTable.propTypes = {
  outputs: PropTypes.object.isRequired,
  time: PropTypes.array,
}
