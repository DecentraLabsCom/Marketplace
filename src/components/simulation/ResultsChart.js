"use client";
import React, { useEffect, useMemo, useState } from 'react'
import PropTypes from 'prop-types'
import { isChartableOutputSeries, normalizeSimulationOutputs } from './simulationOutputs'

const TIME_KEY = '__time__'
const COLORS = ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#a855f7', '#06b6d4', '#ec4899', '#84cc16']
const MODES = [
  { value: 'time', label: 'Time series' },
  { value: '2d', label: '2D plot' },
  { value: '3d', label: '3D trajectory' },
  { value: 'state-space', label: 'State-space projection' },
]
const WIDTH = 700
const HEIGHT = 300
const PAD = 46

function finiteNumber(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function formatNumber(value) {
  const number = finiteNumber(value)
  return number === null ? '' : number.toPrecision(4)
}

function getUnit(variable) {
  const unit = variable?.displayUnit || variable?.unit
  if (typeof unit === 'string') return unit
  return unit?.name || ''
}

function getVariableForSeries(name, variableMetadata = []) {
  const baseName = name.replace(/\[\d+\]$/, '')
  return variableMetadata.find((variable) => variable?.name === name)
    || variableMetadata.find((variable) => variable?.name === baseName)
}

function getSeriesLabel(name, variableMetadata = []) {
  const unit = getUnit(getVariableForSeries(name, variableMetadata))
  return unit ? `${name} (${unit})` : name
}

function getAxisOptions(numericNames, variableMetadata) {
  return [
    { value: TIME_KEY, label: 'Time (s)' },
    ...numericNames.map((name) => ({
      value: name,
      label: getSeriesLabel(name, variableMetadata),
    })),
  ]
}

function getStateSpaceDefaults(numericNames) {
  const stateNames = numericNames.filter((name) => !/^der\(.+\)$/.test(name))
  const stateName = stateNames[0] || numericNames[0] || TIME_KEY
  const derivativeName = numericNames.find((name) => name === `der(${stateName})`)
  return {
    x: stateName,
    y: derivativeName || numericNames[1] || stateName,
  }
}

function getDataValue(name, index, time, outputs) {
  if (name === TIME_KEY) return time[index] ?? index
  return outputs[name]?.[index]
}

function getSeriesLength(name, time, outputs) {
  if (name === TIME_KEY) return time.length
  return outputs[name]?.length || 0
}

function buildPoints({ xAxis, yAxis, zAxis, colorBy, time, outputs }) {
  const names = [xAxis, yAxis, zAxis, colorBy].filter(Boolean)
  const count = Math.max(...names.map((name) => getSeriesLength(name, time, outputs)), 0)
  const points = []

  for (let index = 0; index < count; index += 1) {
    const x = finiteNumber(getDataValue(xAxis, index, time, outputs))
    const y = finiteNumber(getDataValue(yAxis, index, time, outputs))
    const z = zAxis ? finiteNumber(getDataValue(zAxis, index, time, outputs)) : null
    const colorValue = finiteNumber(getDataValue(colorBy, index, time, outputs)) ?? index
    if (x === null || y === null || (zAxis && z === null)) continue
    points.push({ x, y, z, colorValue, index })
  }

  return points
}

function getBounds(values) {
  const finiteValues = values.map(finiteNumber).filter((value) => value !== null)
  if (!finiteValues.length) return { min: 0, max: 1 }
  const min = Math.min(...finiteValues)
  const max = Math.max(...finiteValues)
  if (min === max) return { min: min - 1, max: max + 1 }
  return { min, max }
}

function normalize(value, bounds) {
  return (value - bounds.min) / (bounds.max - bounds.min)
}

function colorFor(value, bounds) {
  const ratio = Math.max(0, Math.min(1, normalize(value, bounds)))
  const red = Math.round(59 + (245 - 59) * ratio)
  const green = Math.round(130 + (158 - 130) * ratio)
  const blue = Math.round(246 + (11 - 246) * ratio)
  return `rgb(${red}, ${green}, ${blue})`
}

function tooltipText(point, xLabel, yLabel, zLabel, colorLabel) {
  const values = [`${xLabel}: ${formatNumber(point.x)}`, `${yLabel}: ${formatNumber(point.y)}`]
  if (zLabel) values.push(`${zLabel}: ${formatNumber(point.z)}`)
  if (colorLabel && colorLabel !== xLabel && colorLabel !== yLabel && colorLabel !== zLabel) {
    values.push(`${colorLabel}: ${formatNumber(point.colorValue)}`)
  }
  return values.join(' · ')
}

function PlotSelect({ label, value, onChange, options }) {
  return (
    <label className="flex flex-col gap-1 text-xs text-text-secondary">
      <span>{label}</span>
      <select
        aria-label={label}
        value={value}
        onChange={onChange}
        className="bg-[#1f2426] border border-[#2a2f33] rounded px-2 py-1 text-neutral-200 text-sm focus:outline-none focus:border-brand"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    </label>
  )
}

function ChartControls({
  mode,
  onModeChange,
  selectedSeries,
  onSeriesToggle,
  numericNames,
  variableMetadata,
  xAxis,
  yAxis,
  zAxis,
  colorBy,
  onAxisChange,
}) {
  const axisOptions = getAxisOptions(numericNames, variableMetadata)
  const selectAxis = (axis) => (event) => onAxisChange(axis, event.target.value)

  return (
    <div className="space-y-3 mb-4" data-testid="chart-controls">
      <div className="flex flex-wrap items-end gap-3">
        <PlotSelect
          label="Chart type"
          value={mode}
          onChange={onModeChange}
          options={MODES}
        />
        {mode !== 'time' && (
          <>
            <PlotSelect label="X axis" value={xAxis} onChange={selectAxis('x')} options={axisOptions} />
            <PlotSelect label="Y axis" value={yAxis} onChange={selectAxis('y')} options={axisOptions} />
            {mode === '3d' && (
              <PlotSelect label="Z axis" value={zAxis} onChange={selectAxis('z')} options={axisOptions} />
            )}
            <PlotSelect label="Color" value={colorBy} onChange={selectAxis('color')} options={axisOptions} />
          </>
        )}
      </div>

      {mode === 'time' && numericNames.length > 0 && (
        <fieldset>
          <legend className="text-xs text-text-secondary mb-1">Outputs to display</legend>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {numericNames.map((name) => (
              <label key={name} className="inline-flex items-center gap-1.5 text-xs text-neutral-300">
                <input
                  type="checkbox"
                  aria-label={`Show ${getSeriesLabel(name, variableMetadata)}`}
                  checked={selectedSeries.includes(name)}
                  onChange={() => onSeriesToggle(name)}
                  className="accent-brand"
                />
                Show {getSeriesLabel(name, variableMetadata)}
              </label>
            ))}
          </div>
        </fieldset>
      )}
    </div>
  )
}

function AxisFrame({ minX, maxX, minY, maxY, xLabel, yLabel, children, testId }) {
  const plotW = WIDTH - 2 * PAD
  const plotH = HEIGHT - 2 * PAD
  const toX = (value) => PAD + normalize(value, { min: minX, max: maxX }) * plotW
  const toY = (value) => PAD + plotH - normalize(value, { min: minY, max: maxY }) * plotH

  return (
    <svg
      data-testid={testId}
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      className="w-full h-auto bg-[#181b1d] rounded-lg border border-[#2a2f33]"
    >
      <line x1={PAD} y1={PAD} x2={PAD} y2={PAD + plotH} stroke="#555" strokeWidth="1" />
      <line x1={PAD} y1={PAD + plotH} x2={PAD + plotW} y2={PAD + plotH} stroke="#555" strokeWidth="1" />
      {[0, 0.25, 0.5, 0.75, 1].map((fraction) => {
        const y = PAD + plotH - fraction * plotH
        const value = minY + fraction * (maxY - minY)
        return (
          <g key={`y-${fraction}`}>
            <line x1={PAD - 4} y1={y} x2={PAD} y2={y} stroke="#555" />
            <text x={PAD - 6} y={y + 3} textAnchor="end" className="text-[10px]" fill="#888">
              {value.toPrecision(3)}
            </text>
          </g>
        )
      })}
      {[0, 0.5, 1].map((fraction) => {
        const x = PAD + fraction * plotW
        const value = minX + fraction * (maxX - minX)
        return (
          <text key={`x-${fraction}`} x={x} y={PAD + plotH + 14} textAnchor="middle" className="text-[10px]" fill="#888">
            {value.toPrecision(3)}
          </text>
        )
      })}
      <text x={WIDTH / 2} y={HEIGHT - 4} textAnchor="middle" className="text-[11px]" fill="#aaa">{xLabel}</text>
      <text x="12" y={HEIGHT / 2} textAnchor="middle" className="text-[11px]" fill="#aaa" transform={`rotate(-90 12 ${HEIGHT / 2})`}>{yLabel}</text>
      {children({ toX, toY })}
    </svg>
  )
}

function TimeSeriesPlot({ series, time }) {
  const pointCount = Math.max(time.length, ...series.map((item) => item.values.length), 0)
  const xValues = Array.from({ length: pointCount }, (_, index) => finiteNumber(time[index]) ?? index)
  const yValues = series.flatMap((item) => item.values.map(finiteNumber).filter((value) => value !== null))
  if (!pointCount || !yValues.length) return <p className="text-text-secondary text-sm">No output data to chart.</p>

  const xBounds = getBounds(xValues)
  const yBounds = getBounds(yValues)
  const axis = { minX: xBounds.min, maxX: xBounds.max, minY: yBounds.min, maxY: yBounds.max }

  return (
    <AxisFrame {...axis} xLabel="Time (s)" yLabel="Output" testId="time-series-plot">
      {({ toX, toY }) => series.map((item, seriesIndex) => {
        const points = item.values.map((value, index) => {
          const number = finiteNumber(value)
          return number === null ? null : `${toX(xValues[index] ?? index)},${toY(number)}`
        }).filter(Boolean).join(' ')
        return (
          <polyline
            key={item.name}
            points={points}
            fill="none"
            stroke={COLORS[seriesIndex % COLORS.length]}
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
        )
      })}
    </AxisFrame>
  )
}

function CartesianPlot({ points, xLabel, yLabel, colorLabel, title }) {
  if (!points.length) return <p className="text-text-secondary text-sm">No compatible numeric data for this plot.</p>

  const xBounds = getBounds(points.map((point) => point.x))
  const yBounds = getBounds(points.map((point) => point.y))
  const colorBounds = getBounds(points.map((point) => point.colorValue))

  return (
    <div>
      {title && <p className="text-xs text-text-secondary mb-1">{title}</p>}
      <AxisFrame
        minX={xBounds.min}
        maxX={xBounds.max}
        minY={yBounds.min}
        maxY={yBounds.max}
        xLabel={xLabel}
        yLabel={yLabel}
        testId="cartesian-plot"
      >
        {({ toX, toY }) => (
          <>
            {points.slice(1).map((point, index) => {
              const previous = points[index]
              return (
                <line
                  key={`segment-${point.index}`}
                  x1={toX(previous.x)}
                  y1={toY(previous.y)}
                  x2={toX(point.x)}
                  y2={toY(point.y)}
                  stroke={colorFor(point.colorValue, colorBounds)}
                  strokeWidth="1.8"
                />
              )
            })}
            {points.map((point) => (
              <circle key={`point-${point.index}`} cx={toX(point.x)} cy={toY(point.y)} r="2.5" fill={colorFor(point.colorValue, colorBounds)}>
                <title>{tooltipText(point, xLabel, yLabel, null, colorLabel)}</title>
              </circle>
            ))}
          </>
        )}
      </AxisFrame>
      <p className="text-[11px] text-text-secondary mt-1">Colour: {colorLabel}</p>
    </div>
  )
}

function ThreeDimensionalPlot({ points, xLabel, yLabel, zLabel, colorLabel }) {
  if (!points.length) return <p className="text-text-secondary text-sm">No compatible numeric data for this plot.</p>

  const bounds = {
    x: getBounds(points.map((point) => point.x)),
    y: getBounds(points.map((point) => point.y)),
    z: getBounds(points.map((point) => point.z)),
    color: getBounds(points.map((point) => point.colorValue)),
  }
  const project = (x, y, z) => {
    const nx = normalize(x, bounds.x) - 0.5
    const ny = normalize(y, bounds.y) - 0.5
    const nz = normalize(z, bounds.z) - 0.5
    const scale = 190
    return {
      x: WIDTH / 2 + (nx - nz) * scale,
      y: HEIGHT / 2 - ny * scale + (nx + nz) * scale * 0.35,
    }
  }
  const axis = (from, to, label, colour) => {
    const start = project(...from)
    const end = project(...to)
    return (
      <g key={label}>
        <line x1={start.x} y1={start.y} x2={end.x} y2={end.y} stroke={colour} strokeWidth="1" />
        <text x={end.x + 4} y={end.y - 4} className="text-[11px]" fill={colour}>{label}</text>
      </g>
    )
  }

  return (
    <div>
      <svg
        data-testid="three-dimensional-plot"
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="w-full h-auto bg-[#181b1d] rounded-lg border border-[#2a2f33]"
      >
        {axis([bounds.x.min, bounds.y.min, bounds.z.min], [bounds.x.max, bounds.y.min, bounds.z.min], xLabel, '#f59e0b')}
        {axis([bounds.x.min, bounds.y.min, bounds.z.min], [bounds.x.min, bounds.y.max, bounds.z.min], yLabel, '#22c55e')}
        {axis([bounds.x.min, bounds.y.min, bounds.z.min], [bounds.x.min, bounds.y.min, bounds.z.max], zLabel, '#3b82f6')}
        {points.slice(1).map((point, index) => {
          const previous = points[index]
          const start = project(previous.x, previous.y, previous.z)
          const end = project(point.x, point.y, point.z)
          return (
            <line
              key={`trajectory-${point.index}`}
              x1={start.x}
              y1={start.y}
              x2={end.x}
              y2={end.y}
              stroke={colorFor(point.colorValue, bounds.color)}
              strokeWidth="2"
            />
          )
        })}
        {points.map((point) => {
          const projected = project(point.x, point.y, point.z)
          return (
            <circle key={`point-${point.index}`} cx={projected.x} cy={projected.y} r="2.8" fill={colorFor(point.colorValue, bounds.color)}>
              <title>{tooltipText(point, xLabel, yLabel, zLabel, colorLabel)}</title>
            </circle>
          )
        })}
      </svg>
      <p className="text-[11px] text-text-secondary mt-1">Colour: {colorLabel}. Hover points for values.</p>
    </div>
  )
}

/**
 * Configurable simulation result visualizer. It deliberately keeps the
 * default time-series view lightweight while exposing arbitrary numeric axes
 * for phase/state-space plots and an SVG-projected 3D trajectory.
 */
export default function ResultsChart({ outputs, time, variableMetadata }) {
  const normalizedOutputs = useMemo(
    () => normalizeSimulationOutputs(outputs, variableMetadata),
    [outputs, variableMetadata],
  )
  const numericNames = useMemo(
    () => Object.entries(normalizedOutputs)
      .filter(([name, values]) => isChartableOutputSeries(name, values, variableMetadata))
      .map(([name]) => name),
    [normalizedOutputs, variableMetadata],
  )
  const timeArr = useMemo(() => (Array.isArray(time) ? time : []), [time])
  const axisOptions = useMemo(
    () => getAxisOptions(numericNames, variableMetadata),
    [numericNames, variableMetadata],
  )
  const stateDefaults = useMemo(() => getStateSpaceDefaults(numericNames), [numericNames])
  const [mode, setMode] = useState('time')
  const [selectedSeries, setSelectedSeries] = useState(numericNames)
  const [xAxis, setXAxis] = useState(TIME_KEY)
  const [yAxis, setYAxis] = useState(numericNames[0] || TIME_KEY)
  const [zAxis, setZAxis] = useState(numericNames[2] || numericNames[1] || TIME_KEY)
  const [colorBy, setColorBy] = useState(TIME_KEY)

  useEffect(() => {
    setSelectedSeries((previous) => {
      const kept = previous.filter((name) => numericNames.includes(name))
      return kept.length ? kept : numericNames
    })
    setXAxis((previous) => axisOptions.some((option) => option.value === previous) ? previous : (axisOptions[0]?.value || TIME_KEY))
    setYAxis((previous) => axisOptions.some((option) => option.value === previous) ? previous : (numericNames[0] || TIME_KEY))
    setZAxis((previous) => axisOptions.some((option) => option.value === previous) ? previous : (numericNames[2] || numericNames[1] || TIME_KEY))
    setColorBy((previous) => axisOptions.some((option) => option.value === previous) ? previous : TIME_KEY)
  }, [axisOptions, numericNames])

  const handleModeChange = (event) => {
    const nextMode = event.target.value
    setMode(nextMode)
    if (nextMode === 'state-space') {
      setXAxis(stateDefaults.x)
      setYAxis(stateDefaults.y)
      setColorBy(TIME_KEY)
    } else if (nextMode === '3d') {
      setXAxis(numericNames[0] || TIME_KEY)
      setYAxis(numericNames[1] || numericNames[0] || TIME_KEY)
      setZAxis(numericNames[2] || numericNames[1] || numericNames[0] || TIME_KEY)
      setColorBy(TIME_KEY)
    } else if (nextMode === '2d') {
      setXAxis(TIME_KEY)
      setYAxis(numericNames[0] || TIME_KEY)
      setColorBy(TIME_KEY)
    }
  }

  const toggleSeries = (name) => {
    setSelectedSeries((previous) => previous.includes(name)
      ? previous.filter((item) => item !== name)
      : [...previous, name])
  }

  const handleAxisChange = (axis, value) => {
    if (axis === 'x') setXAxis(value)
    if (axis === 'y') setYAxis(value)
    if (axis === 'z') setZAxis(value)
    if (axis === 'color') setColorBy(value)
  }

  const timeSeries = numericNames
    .filter((name) => selectedSeries.includes(name))
    .map((name) => ({ name, values: normalizedOutputs[name] || [] }))
  const plottedPoints = useMemo(() => buildPoints({
    xAxis,
    yAxis,
    zAxis: mode === '3d' ? zAxis : null,
    colorBy,
    time: timeArr,
    outputs: normalizedOutputs,
  }), [colorBy, mode, normalizedOutputs, timeArr, xAxis, yAxis, zAxis])
  const labelFor = (name) => name === TIME_KEY ? 'Time (s)' : getSeriesLabel(name, variableMetadata)

  return (
    <div>
      <ChartControls
        mode={mode}
        onModeChange={handleModeChange}
        selectedSeries={selectedSeries}
        onSeriesToggle={toggleSeries}
        numericNames={numericNames}
        variableMetadata={variableMetadata}
        xAxis={xAxis}
        yAxis={yAxis}
        zAxis={zAxis}
        colorBy={colorBy}
        onAxisChange={handleAxisChange}
      />
      {mode === 'state-space' && (
        <p className="text-xs text-text-secondary mb-2">
          Choose state variables, derivatives or other numeric components for the axes.
        </p>
      )}
      {mode === 'time' && <TimeSeriesPlot series={timeSeries} time={timeArr} />}
      {mode === '2d' && (
        <CartesianPlot
          points={plottedPoints}
          xLabel={labelFor(xAxis)}
          yLabel={labelFor(yAxis)}
          colorLabel={labelFor(colorBy)}
        />
      )}
      {mode === 'state-space' && (
        <CartesianPlot
          points={plottedPoints}
          xLabel={labelFor(xAxis)}
          yLabel={labelFor(yAxis)}
          colorLabel={labelFor(colorBy)}
        />
      )}
      {mode === '3d' && (
        <ThreeDimensionalPlot
          points={plottedPoints}
          xLabel={labelFor(xAxis)}
          yLabel={labelFor(yAxis)}
          zLabel={labelFor(zAxis)}
          colorLabel={labelFor(colorBy)}
        />
      )}
      {mode === 'time' && timeSeries.length > 0 && (
        <div className="flex flex-wrap gap-4 mt-2">
          {timeSeries.map((series, index) => (
            <div key={series.name} className="flex items-center gap-1.5 text-xs text-neutral-300">
              <span className="inline-block w-3 h-0.5 rounded" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
              {getSeriesLabel(series.name, variableMetadata)}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

ResultsChart.propTypes = {
  outputs: PropTypes.object.isRequired,
  time: PropTypes.array,
  variableMetadata: PropTypes.array,
}
