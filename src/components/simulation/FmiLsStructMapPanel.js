import PropTypes from 'prop-types'
import { getFmiLsStructMapSeries } from '@/utils/fmiLsStruct'

const WIDTH = 720
const HEIGHT = 300
const MARGIN = { top: 18, right: 22, bottom: 62, left: 74 }
const TICK_COUNT = 5

function formatTick(value) {
  if (!Number.isFinite(value)) return ''
  if (Math.abs(value) >= 1000 || (Math.abs(value) > 0 && Math.abs(value) < 0.01)) return value.toExponential(1)
  return Number(value.toPrecision(3)).toString()
}

function FmiLsStructMapChart({ series }) {
  const plotWidth = WIDTH - MARGIN.left - MARGIN.right
  const plotHeight = HEIGHT - MARGIN.top - MARGIN.bottom
  const xMin = Math.min(...series.x)
  const xMax = Math.max(...series.x)
  const yMin = Math.min(...series.y)
  const yMax = Math.max(...series.y)
  const xRange = xMax === xMin ? 1 : xMax - xMin
  const yRange = yMax === yMin ? 1 : yMax - yMin
  const xDomainMin = xMax === xMin ? xMin - 0.5 : xMin
  const yDomainMin = yMax === yMin ? yMin - 0.5 : yMin
  const x = (value) => MARGIN.left + ((value - xDomainMin) / xRange) * plotWidth
  const y = (value) => MARGIN.top + plotHeight - ((value - yDomainMin) / yRange) * plotHeight
  const points = series.x.map((value, index) => `${x(value)},${y(series.y[index])}`).join(' ')

  return (
    <figure className="min-w-0 rounded-xl border border-[#2a4149] bg-[#0c171c] p-3">
      <figcaption className="mb-2 truncate text-sm font-semibold text-white" title={series.name}>{series.name}</figcaption>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="block h-auto w-full"
        role="img"
        aria-label={`${series.name}: ${series.yLabel} by ${series.xLabel}`}
      >
        {Array.from({ length: TICK_COUNT }, (_, index) => {
          const fraction = index / (TICK_COUNT - 1)
          const horizontal = MARGIN.top + fraction * plotHeight
          const vertical = MARGIN.left + fraction * plotWidth
          const yTick = yMax === yMin ? yMin : yMax - fraction * (yMax - yMin)
          const xTick = xMin === xMax ? xMin : xMin + fraction * (xMax - xMin)
          return (
            <g key={index}>
              <line x1={MARGIN.left} x2={WIDTH - MARGIN.right} y1={horizontal} y2={horizontal} stroke="#294047" strokeWidth="1" />
              <text x={MARGIN.left - 8} y={horizontal + 4} fill="#a5bec2" fontSize="11" textAnchor="end">{formatTick(yTick)}</text>
              <line x1={vertical} x2={vertical} y1={MARGIN.top} y2={MARGIN.top + plotHeight} stroke="#1f343b" strokeWidth="1" />
              <text x={vertical} y={MARGIN.top + plotHeight + 18} fill="#a5bec2" fontSize="11" textAnchor="middle">{formatTick(xTick)}</text>
            </g>
          )
        })}
        <polyline points={points} fill="none" stroke="#5be0cf" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
        {series.x.map((value, index) => (
          <circle key={`${value}-${index}`} cx={x(value)} cy={y(series.y[index])} r="4" fill="#b6fff2" stroke="#0c171c" strokeWidth="2" />
        ))}
        <text x={MARGIN.left + plotWidth / 2} y={HEIGHT - 8} fill="#d3e2e4" fontSize="12" textAnchor="middle">
          {series.xLabel}{series.xUnit ? ` (${series.xUnit})` : ''}
        </text>
        <text
          x="17"
          y={MARGIN.top + plotHeight / 2}
          fill="#d3e2e4"
          fontSize="12"
          textAnchor="middle"
          transform={`rotate(-90 17 ${MARGIN.top + plotHeight / 2})`}
        >
          {series.yLabel}{series.yUnit ? ` (${series.yUnit})` : ''}
        </text>
      </svg>
    </figure>
  )
}

FmiLsStructMapChart.propTypes = {
  series: PropTypes.shape({
    name: PropTypes.string.isRequired,
    x: PropTypes.arrayOf(PropTypes.number).isRequired,
    y: PropTypes.arrayOf(PropTypes.number).isRequired,
    xLabel: PropTypes.string.isRequired,
    yLabel: PropTypes.string.isRequired,
    xUnit: PropTypes.string.isRequired,
    yUnit: PropTypes.string.isRequired,
  }).isRequired,
}

export default function FmiLsStructMapPanel({ fmiLsStruct, modelVariables, showHeading = true }) {
  const series = getFmiLsStructMapSeries(fmiLsStruct, modelVariables)
  if (series.length === 0) return null

  return (
    <section
      className="rounded-xl border border-[#2a4149] bg-[#101a20] p-4"
      aria-labelledby={showHeading ? 'fmi-ls-struct-heading' : undefined}
      aria-label={showHeading ? undefined : 'FMI-LS-STRUCT maps'}
    >
      {showHeading ? (
        <div className="mb-3">
          <h3 id="fmi-ls-struct-heading" className="text-sm font-semibold text-white">FMI-LS-STRUCT maps</h3>
          <p className="mt-1 text-xs text-[#a5bec2]">Reference curves declared in FMI-LS-STRUCT {fmiLsStruct.manifestVersion}.</p>
        </div>
      ) : null}
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        {series.map((curve) => <FmiLsStructMapChart key={curve.name} series={curve} />)}
      </div>
    </section>
  )
}

FmiLsStructMapPanel.propTypes = {
  fmiLsStruct: PropTypes.object,
  modelVariables: PropTypes.arrayOf(PropTypes.object),
  showHeading: PropTypes.bool,
}
