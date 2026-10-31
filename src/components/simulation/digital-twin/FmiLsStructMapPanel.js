import PropTypes from 'prop-types'
import { getFmiLsStructMapData } from '@/utils/fmiLsStruct'

const WIDTH = 720
const HEIGHT = 300
const MARGIN = { top: 18, right: 22, bottom: 62, left: 74 }
const TICK_COUNT = 5
const TABLE_ROWS = 128

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
        {series.orderingConstraint === 'unordered' ? null : (
          <polyline points={points} fill="none" stroke="#5be0cf" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
        )}
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
    orderingConstraint: PropTypes.string,
  }).isRequired,
}

function ValueList({ values, unit = '' }) {
  if (!values?.length) return <span className="text-[#829ba1]">Not available</span>
  const preview = values.slice(0, 16).map(formatTick).join(', ')
  return (
    <span className="font-mono text-xs text-[#d3e2e4]" title={`${values.length} values`}>
      {preview}{values.length > 16 ? `, … (${values.length} values)` : ''}{unit ? ` ${unit}` : ''}
    </span>
  )
}

ValueList.propTypes = {
  values: PropTypes.arrayOf(PropTypes.number),
  unit: PropTypes.string,
}

function MapValuesTable({ map }) {
  const rowCount = Math.min(map.expectedCount, TABLE_ROWS)
  if (!Number.isInteger(rowCount) || rowCount < 1) return null

  return (
    <div className="overflow-x-auto rounded-lg border border-[#26383f]">
      <table className="min-w-full text-left text-xs">
        <thead className="bg-[#142128] text-[#a5bec2]">
          <tr>
            <th className="whitespace-nowrap px-3 py-2 font-medium">Linear sample</th>
            {map.codomains.map((codomain) => (
              <th key={codomain.variableName} className="whitespace-nowrap px-3 py-2 font-medium">
                {codomain.label}{codomain.unit ? ` (${codomain.unit})` : ''}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rowCount }, (_, row) => (
            <tr key={row} className="border-t border-[#26383f] text-[#d3e2e4]">
              <td className="px-3 py-1.5 font-mono text-[#829ba1]">{row}</td>
              {map.codomains.map((codomain) => (
                <td key={codomain.variableName} className="px-3 py-1.5 font-mono">
                  {formatTick(codomain.values[row])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {map.expectedCount > rowCount ? (
        <p className="border-t border-[#26383f] px-3 py-2 text-[11px] text-[#829ba1]">
          Showing {rowCount} of {map.expectedCount} values.
        </p>
      ) : null}
    </div>
  )
}

MapValuesTable.propTypes = {
  map: PropTypes.shape({
    expectedCount: PropTypes.number.isRequired,
    codomains: PropTypes.arrayOf(PropTypes.object).isRequired,
  }).isRequired,
}

function FmiLsStructMapCard({ map }) {
  const charts = map.series
  const points = map.axes.filter((axis) => axis.operatingPoint)
  const outputs = map.codomains.filter((codomain) => codomain.currentOutput)
  const canShowValues = map.supportedValues && map.codomains.length > 0

  return (
    <article className="min-w-0 rounded-xl border border-[#2a4149] bg-[#0c171c] p-3">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h4 className="text-sm font-semibold text-white">{map.name}</h4>
        <span className="text-[10px] uppercase tracking-wide text-[#829ba1]">
          {map.terminalKind.endsWith('.irregular') ? 'Irregular grid' : 'Rectilinear grid'}
          {map.shape.length ? ` · shape ${map.shape.join(' × ')}` : ''}
        </span>
      </div>

      {map.axes.length > 0 ? (
        <div className="mb-3 grid gap-2 sm:grid-cols-2">
          {map.axes.map((axis) => (
            <div key={axis.variableName} className="min-w-0 rounded-lg border border-[#26383f] bg-[#101a20] px-3 py-2">
              <div className="mb-1 text-xs font-semibold text-[#b6fff2]">Domain · {axis.label}</div>
              <ValueList values={axis.values} unit={axis.unit} />
              {axis.orderingConstraint || map.terminalKind.endsWith('.rectilinearGrid') ? (
                <p className="mt-1 text-[10px] text-[#829ba1]">Ordering: {axis.orderingConstraint || 'unordered'}</p>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      {points.length > 0 ? (
        <section className="mb-3 rounded-lg border border-[#26383f] bg-[#101a20] p-3" aria-label="Current operating point">
          <h5 className="mb-2 text-xs font-semibold text-white">Current operating point</h5>
          <div className="grid gap-2 sm:grid-cols-2">
            {points.map((axis) => (
              <p key={axis.variableName} className="min-w-0 text-xs text-[#a5bec2]">
                {axis.label}: <ValueList values={axis.operatingPoint.values} unit={axis.unit} />
              </p>
            ))}
          </div>
        </section>
      ) : null}

      {charts.length > 0 ? (
        <div className="mb-3 grid grid-cols-1 gap-3 xl:grid-cols-2">
          {charts.map((series) => <FmiLsStructMapChart key={series.name} series={series} />)}
        </div>
      ) : canShowValues ? <MapValuesTable map={map} /> : (
        <p className="rounded-lg border border-[#6c5530] bg-[#2c2618] px-3 py-2 text-xs text-[#e6d4a3]">
          {map.isOneDimensional && map.curveDiagnostics.length > 0
            ? map.curveDiagnostics.join(' ')
            : 'The declared map arrays are unavailable or their dimensions do not match the terminal declaration, so the values cannot be plotted safely.'}
        </p>
      )}

      {map.isOneDimensional && (charts.length > 0 || canShowValues) && map.curveDiagnostics.length > 0 ? (
        <p className="mb-3 rounded-lg border border-[#6c5530] bg-[#2c2618] px-3 py-2 text-xs text-[#e6d4a3]" role="status">
          {map.curveDiagnostics.join(' ')}
        </p>
      ) : null}
      {map.isOneDimensional && map.curveNotes.length > 0 ? (
        <p className="mb-3 rounded-lg border border-[#31535a] bg-[#10252a] px-3 py-2 text-xs text-[#a5bec2]" role="status">
          {map.curveNotes.join(' ')}
        </p>
      ) : null}

      {outputs.length > 0 ? (
        <section className="mt-3 rounded-lg border border-[#26383f] bg-[#101a20] p-3" aria-label="Current map outputs">
          <h5 className="mb-2 text-xs font-semibold text-white">Current map outputs</h5>
          <div className="grid gap-2 sm:grid-cols-2">
            {outputs.map((codomain) => (
              <p key={codomain.variableName} className="min-w-0 text-xs text-[#a5bec2]">
                {codomain.label}: <ValueList values={codomain.currentOutput.values} unit={codomain.unit} />
              </p>
            ))}
          </div>
        </section>
      ) : null}
    </article>
  )
}

FmiLsStructMapCard.propTypes = { map: PropTypes.object.isRequired }

export default function FmiLsStructMapPanel({
  fmiLsStruct,
  modelVariables,
  values = {},
  outputs = {},
  showHeading = true,
}) {
  const maps = getFmiLsStructMapData(fmiLsStruct, modelVariables, values, outputs)
  if (maps.length === 0) return null

  return (
    <section
      className="rounded-xl border border-[#2a4149] bg-[#101a20] p-4"
      aria-labelledby={showHeading ? 'fmi-ls-struct-heading' : undefined}
      aria-label={showHeading ? undefined : 'FMI-LS-STRUCT maps'}
    >
      {showHeading ? (
        <div className="mb-3">
          <h3 id="fmi-ls-struct-heading" className="text-sm font-semibold text-white">FMI-LS-STRUCT maps</h3>
          <p className="mt-1 text-xs text-[#a5bec2]">Maps, operating points and outputs declared in FMI-LS-STRUCT {fmiLsStruct.manifestVersion}.</p>
        </div>
      ) : null}
      <div className="grid grid-cols-1 gap-3">
        {maps.map((map) => <FmiLsStructMapCard key={map.name} map={map} />)}
      </div>
    </section>
  )
}

FmiLsStructMapPanel.propTypes = {
  fmiLsStruct: PropTypes.object,
  modelVariables: PropTypes.arrayOf(PropTypes.object),
  values: PropTypes.object,
  outputs: PropTypes.object,
  showHeading: PropTypes.bool,
}
