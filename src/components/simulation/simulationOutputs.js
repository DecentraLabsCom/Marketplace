import { getVariableValueCount } from './simulationParameters'

const NUMERIC_OUTPUT_TYPES = new Set([
  'real',
  'float32',
  'float64',
  'integer',
  'int8',
  'uint8',
  'int16',
  'uint16',
  'int32',
  'uint32',
  'int64',
  'uint64',
  'enumeration',
  'boolean',
])

function getVariableMetadata(name, variableMetadata) {
  const baseName = name.replace(/\[\d+\]$/, '')
  return variableMetadata.find((variable) => variable?.name === name)
    || variableMetadata.find((variable) => variable?.name === baseName)
}

/**
 * Convert FMI output samples into scalar series suitable for charts, tables,
 * and CSV exports. FMU model metadata is used to resolve dimensions when a
 * variable is represented as a vector; the sample shape remains a fallback
 * for older metadata or gateways that omit it.
 *
 * For example, `{ y: [[1, 2, 3], [4, 5, 6]] }` becomes `y[0]`, `y[1]`, and
 * `y[2]`, while a scalar or a non-numeric output keeps its original name.
 */
export function normalizeSimulationOutputs(outputs, variableMetadata = []) {
  if (!outputs || typeof outputs !== 'object') return {}

  const metadata = Array.isArray(variableMetadata) ? variableMetadata : []
  const normalized = {}
  Object.entries(outputs).forEach(([name, values]) => {
    if (!Array.isArray(values)) return

    const observedComponentCount = values.reduce(
      (count, sample) => (Array.isArray(sample) ? Math.max(count, sample.length) : count),
      0,
    )
    const variable = getVariableMetadata(name, metadata)
    const metadataComponentCount = variable ? getVariableValueCount(variable, metadata) : 1
    const componentCount = observedComponentCount > 0
      ? Math.max(observedComponentCount, metadataComponentCount)
      : 0

    if (componentCount === 0) {
      normalized[name] = values
      return
    }

    for (let component = 0; component < componentCount; component += 1) {
      normalized[`${name}[${component}]`] = values.map((sample) => (
        Array.isArray(sample) ? sample[component] ?? null : null
      ))
    }
  })

  return normalized
}

/**
 * Return whether one normalized output series is meaningful on a numeric
 * chart. Non-numeric FMI types remain available in the table/export.
 */
export function isChartableOutputSeries(name, values, variableMetadata = []) {
  const metadata = Array.isArray(variableMetadata) ? variableMetadata : []
  const variable = getVariableMetadata(name, metadata)
  if (variable?.type && !NUMERIC_OUTPUT_TYPES.has(String(variable.type).toLowerCase())) {
    return false
  }

  return Array.isArray(values) && values.some((value) => (
    value !== null && value !== undefined && Number.isFinite(Number(value))
  ))
}
