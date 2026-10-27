'use client'

import { useEffect, useRef, useState } from 'react'
import PropTypes from 'prop-types'
import DigitalTwinInput from './DigitalTwinInput'

export default function DigitalTwinInputGrid({
  variables,
  modelVariables,
  values,
  onChange,
  disabled = false,
  emptyMessage,
  maxVisibleRows = 0,
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
  }, [maxVisibleRows, variables])

  if (variables.length === 0) {
    return emptyMessage ? (
      <p className="rounded-lg border border-[#26383f] bg-[#0c171c] px-3 py-2 text-xs text-[#829ba1]">
        {emptyMessage}
      </p>
    ) : null
  }

  const grid = (
    <div ref={gridRef} className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
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
}
