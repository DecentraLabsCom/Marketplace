"use client";
import React, { useMemo } from 'react'
import PropTypes from 'prop-types'

/**
 * Minimal inline SVG line chart for simulation results.
 * Displays one polyline per output variable.
 */

const COLORS = ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#a855f7', '#06b6d4', '#ec4899', '#84cc16']

export default function ResultsChart({ outputs, time }) {
  const series = useMemo(() => {
    if (!outputs || typeof outputs !== 'object') return []
    return Object.entries(outputs).map(([name, values], idx) => ({
      name,
      values: Array.isArray(values) ? values : [],
      color: COLORS[idx % COLORS.length],
    }))
  }, [outputs])

  const timeArr = useMemo(() => (Array.isArray(time) ? time : []), [time])

  // Compute bounds
  const { minY, maxY } = useMemo(() => {
    let mn = Infinity, mx = -Infinity
    series.forEach(s => s.values.forEach(v => {
      const n = Number(v)
      if (!isNaN(n)) { if (n < mn) mn = n; if (n > mx) mx = n }
    }))
    if (!isFinite(mn)) { mn = 0; mx = 1 }
    if (mn === mx) { mn -= 1; mx += 1 }
    return { minY: mn, maxY: mx }
  }, [series])

  if (!series.length || !timeArr.length) {
    return <p className="text-text-secondary text-sm">No output data to chart.</p>
  }

  const W = 700, H = 300, PAD = 40
  const plotW = W - 2 * PAD, plotH = H - 2 * PAD

  const toX = (i) => PAD + (i / (timeArr.length - 1 || 1)) * plotW
  const toY = (v) => PAD + plotH - ((Number(v) - minY) / (maxY - minY)) * plotH

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto bg-[#181b1d] rounded-lg border border-[#2a2f33]">
        {/* Y axis line */}
        <line x1={PAD} y1={PAD} x2={PAD} y2={PAD + plotH} stroke="#555" strokeWidth="1" />
        {/* X axis line */}
        <line x1={PAD} y1={PAD + plotH} x2={PAD + plotW} y2={PAD + plotH} stroke="#555" strokeWidth="1" />

        {/* Y labels */}
        {[0, 0.25, 0.5, 0.75, 1].map(frac => {
          const y = PAD + plotH - frac * plotH
          const val = minY + frac * (maxY - minY)
          return (
            <g key={frac}>
              <line x1={PAD - 4} y1={y} x2={PAD} y2={y} stroke="#555" />
              <text x={PAD - 6} y={y + 3} textAnchor="end" className="text-[10px]" fill="#888">{val.toPrecision(3)}</text>
            </g>
          )
        })}

        {/* X labels */}
        {[0, 0.5, 1].map(frac => {
          const idx = Math.round(frac * (timeArr.length - 1))
          const x = toX(idx)
          return (
            <text key={frac} x={x} y={PAD + plotH + 14} textAnchor="middle" className="text-[10px]" fill="#888">
              {Number(timeArr[idx]).toPrecision(3)}s
            </text>
          )
        })}

        {/* Data lines */}
        {series.map(s => {
          const points = s.values.map((v, i) => `${toX(i)},${toY(v)}`).join(' ')
          return (
            <polyline
              key={s.name}
              points={points}
              fill="none"
              stroke={s.color}
              strokeWidth="1.5"
              strokeLinejoin="round"
            />
          )
        })}
      </svg>

      {/* Legend */}
      <div className="flex flex-wrap gap-4 mt-2">
        {series.map(s => (
          <div key={s.name} className="flex items-center gap-1.5 text-xs text-neutral-300">
            <span className="inline-block w-3 h-0.5 rounded" style={{ backgroundColor: s.color }} />
            {s.name}
          </div>
        ))}
      </div>
    </div>
  )
}

ResultsChart.propTypes = {
  outputs: PropTypes.object.isRequired,
  time: PropTypes.array,
}
