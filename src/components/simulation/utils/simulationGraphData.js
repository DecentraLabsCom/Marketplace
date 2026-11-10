import {
  getVariableDisplayName,
  getVariableDisplayUnit,
  getVariableValueCount,
  toVariableDisplayValue,
} from './simulationParameters'

const GRAPHABLE_TYPES = new Set([
  'Real', 'Float32', 'Float64', 'Integer', 'Enumeration',
  'Int8', 'UInt8', 'Int16', 'UInt16', 'Int32', 'UInt32', 'Int64', 'UInt64', 'Boolean',
])

export const SIMULATION_TIME_VARIABLE = '__simulation_time__'

export function isGraphableVariable(variable, modelVariables = []) {
  if (Array.isArray(variable?.dimensions) && variable.dimensions.length > 0) return false
  return Boolean(variable?.name)
    && GRAPHABLE_TYPES.has(variable.type)
    && getVariableValueCount(variable, modelVariables) === 1
    && ['input', 'output', 'independent'].includes(variable.causality)
}

export function getGraphableVariables(modelVariables = []) {
  return modelVariables.filter((variable) => isGraphableVariable(variable, modelVariables))
}

export function createGraphConfiguration(index, modelVariables = []) {
  const graphableVariables = getGraphableVariables(modelVariables)
  const independent = graphableVariables.find((variable) => variable.causality === 'independent')
  const firstOutput = graphableVariables.find((variable) => variable.causality === 'output')
  const firstInput = graphableVariables.find((variable) => variable.causality === 'input')
  return {
    id: `simulation-graph-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${index}`}`,
    name: `Graph ${index}`,
    xVariable: independent?.name || SIMULATION_TIME_VARIABLE,
    yVariables: [firstOutput || firstInput].filter(Boolean).map((variable) => variable.name),
  }
}

export function getGraphVariableLabel(variable, timeUnit = 's') {
  if (!variable || variable === SIMULATION_TIME_VARIABLE) return `Simulation time (${timeUnit || 's'})`
  const displayName = getVariableDisplayName(variable)
  const unit = getVariableDisplayUnit(variable)
  return unit ? `${displayName} (${unit})` : displayName
}

function toNumericDisplayValue(value, variable) {
  if (value === null || value === undefined || value === '') return null
  if (typeof value === 'boolean') return value ? 1 : 0
  const numericValue = Number(value)
  if (!Number.isFinite(numericValue)) return null
  const displayValue = variable ? Number(toVariableDisplayValue(variable, numericValue)) : numericValue
  return Number.isFinite(displayValue) ? displayValue : null
}

export function buildSimulationGraphData(graph, results, modelVariables = [], currentInputValues = {}, timeUnit = 's') {
  const variables = new Map(modelVariables.map((variable) => [variable.name, variable]))
  const times = Array.isArray(results?.time) ? results.time : []
  const outputs = results?.outputs || {}
  const inputs = results?.inputs || {}
  const xVariable = graph.xVariable === SIMULATION_TIME_VARIABLE ? null : variables.get(graph.xVariable)
  const xValues = !xVariable || xVariable.causality === 'independent'
    ? times
    : (xVariable.causality === 'input' ? inputs[xVariable.name] : outputs[xVariable.name])
      || (xVariable.causality === 'input' && currentInputValues[xVariable.name] !== undefined
        ? Array(times.length).fill(currentInputValues[xVariable.name])
        : [])
  const pointCount = Math.min(times.length, Array.isArray(xValues) ? xValues.length : times.length)
  const series = (Array.isArray(graph.yVariables) ? graph.yVariables : []).flatMap((name, seriesIndex) => {
    const variable = variables.get(name)
    if (!variable || !['input', 'output'].includes(variable.causality)) return []
    const values = variable.causality === 'input' ? inputs[name] : outputs[name]
    const fallbackValue = variable.causality === 'input' ? currentInputValues[name] : undefined
    const seriesValues = Array.isArray(values) ? values : Array(pointCount).fill(fallbackValue)
    const points = []
    for (let index = 0; index < Math.min(pointCount, seriesValues.length); index += 1) {
      const rawX = Array.isArray(xValues) ? xValues[index] : times[index]
      const x = toNumericDisplayValue(rawX, xVariable)
      const y = toNumericDisplayValue(seriesValues[index], variable)
      if (x !== null && y !== null) points.push([x, y])
    }
    return [{
      name: getVariableDisplayName(variable),
      variableName: name,
      unit: getVariableDisplayUnit(variable),
      colorIndex: seriesIndex,
      data: points,
    }]
  })

  return {
    xAxisName: getGraphVariableLabel(xVariable, timeUnit),
    xUnit: xVariable ? getVariableDisplayUnit(xVariable) : (timeUnit || 's'),
    series,
  }
}
