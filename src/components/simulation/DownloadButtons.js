"use client";
import React, { useCallback } from 'react'
import PropTypes from 'prop-types'

/**
 * DownloadButtons — export simulation results as CSV or JSON.
 *
 * @param {Object} props
 * @param {Object} props.results - { time: number[], outputs: { [name]: number[] } }
 * @param {string} [props.labName]
 */
export default function DownloadButtons({ results, labName }) {
  const safeName = (labName || 'simulation').replace(/[^a-zA-Z0-9_-]/g, '_')

  const downloadJSON = useCallback(() => {
    const blob = new Blob([JSON.stringify(results, null, 2)], { type: 'application/json' })
    triggerDownload(blob, `${safeName}_results.json`)
  }, [results, safeName])

  const downloadCSV = useCallback(() => {
    const timeArr = Array.isArray(results?.time) ? results.time : []
    const outputs = results?.outputs || {}
    const columns = Object.keys(outputs)

    const header = ['time', ...columns].join(',')
    const rowCount = Math.max(timeArr.length, ...columns.map(c => outputs[c]?.length ?? 0), 0)
    const rows = Array.from({ length: rowCount }, (_, i) => {
      return [timeArr[i] ?? '', ...columns.map(c => outputs[c]?.[i] ?? '')].join(',')
    })

    const csv = [header, ...rows].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    triggerDownload(blob, `${safeName}_results.csv`)
  }, [results, safeName])

  if (!results) return null

  return (
    <div className="flex gap-3">
      <button
        onClick={downloadCSV}
        className="px-4 py-1.5 rounded text-sm font-medium bg-[#1f2426] border border-[#2a2f33] text-neutral-200 hover:bg-[#2a2f33] transition-colors"
      >
        📥 Download CSV
      </button>
      <button
        onClick={downloadJSON}
        className="px-4 py-1.5 rounded text-sm font-medium bg-[#1f2426] border border-[#2a2f33] text-neutral-200 hover:bg-[#2a2f33] transition-colors"
      >
        📥 Download JSON
      </button>
    </div>
  )
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

DownloadButtons.propTypes = {
  results: PropTypes.shape({
    time: PropTypes.array,
    outputs: PropTypes.object,
  }),
  labName: PropTypes.string,
}
