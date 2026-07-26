const NUMERIC_TYPES = new Set([
  'Real',
  'Float32',
  'Float64',
  'Integer',
  'Int8',
  'UInt8',
  'Int16',
  'UInt16',
  'Int32',
  'UInt32',
  'Int64',
  'UInt64',
])
const INTEGER_TYPES = new Set([
  'Integer',
  'Int8',
  'UInt8',
  'Int16',
  'UInt16',
  'Int32',
  'UInt32',
  'Int64',
  'UInt64',
])

function parsePositiveInteger(value) {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

function resolveDimensionSize(dimension, modelVariables) {
  const dimensionVariable = modelVariables.find((variable) => (
    (dimension?.variableName && variable.name === dimension.variableName) ||
    (dimension?.valueReference != null && variable.valueReference === dimension.valueReference)
  ))
  return parsePositiveInteger(dimension?.start ?? dimensionVariable?.start)
}

export function getVariableValueCount(variable, modelVariables = []) {
  const dimensions = Array.isArray(variable?.dimensions) ? variable.dimensions : []
  if (dimensions.length > 0) {
    const sizes = dimensions.map((dimension) => resolveDimensionSize(dimension, modelVariables))
    if (sizes.every(Boolean)) return sizes.reduce((total, size) => total * size, 1)
  }

  if (Array.isArray(variable?.start) && variable.start.length > 1) {
    return variable.start.length
  }

  if (typeof variable?.start === 'string' && NUMERIC_TYPES.has(variable.type)) {
    const values = variable.start.trim().split(/[\s,]+/).filter(Boolean)
    if (values.length > 1) return values.length
  }

  return 1
}

export function formatParameterValue(value) {
  if (Array.isArray(value)) return value.join(' ')
  return value ?? ''
}

export function getVariableInputDetails(variable, modelVariables = []) {
  const valueCount = getVariableValueCount(variable, modelVariables)
  const type = variable?.type || 'Value'
  const shape = valueCount > 1 ? `vector[${valueCount}]` : 'scalar'
  const normalizedType = String(variable?.type || '').toLowerCase()
  let format = 'a value'

  if (valueCount > 1) {
    const valueLabel = INTEGER_TYPES.has(variable?.type) ? 'whole numbers' : 'numbers'
    format = `${valueCount} ${valueLabel} separated by spaces`
  } else if (normalizedType === 'boolean') {
    format = 'true or false'
  } else if (INTEGER_TYPES.has(variable?.type)) {
    format = 'a whole number'
  } else if (NUMERIC_TYPES.has(variable?.type)) {
    format = 'a number'
  } else if (normalizedType === 'string') {
    format = 'text'
  }

  let range = null
  if (variable?.min != null && variable?.max != null) {
    range = `Allowed: ${variable.min} to ${variable.max}`
  } else if (variable?.min != null) {
    range = `Minimum: ${variable.min}`
  } else if (variable?.max != null) {
    range = `Maximum: ${variable.max}`
  }

  return {
    valueCount,
    inputType: valueCount > 1 || !NUMERIC_TYPES.has(variable?.type) ? 'text' : 'number',
    summary: `${type} · ${shape}`,
    format: `Format: ${format}`,
    range,
  }
}

function coerceParameterValue(value, variable) {
  if (!NUMERIC_TYPES.has(variable?.type)) return value
  if (value === '' || value === null || value === undefined) return value
  const numericValue = Number(value)
  return Number.isFinite(numericValue) ? numericValue : value
}

export function normalizeParameterValue(variable, value, modelVariables = []) {
  const valueCount = getVariableValueCount(variable, modelVariables)
  if (valueCount === 1) return coerceParameterValue(value, variable)

  const values = Array.isArray(value)
    ? value
    : String(value ?? '').trim().split(/[\s,]+/).filter(Boolean)

  if (values.length !== valueCount) {
    throw new Error(`Input ${variable.name} requires ${valueCount} values separated by spaces.`)
  }

  return values.map((item) => coerceParameterValue(item, variable))
}

export function normalizeSimulationParameters(parameters, modelVariables = []) {
  const variableMap = new Map(modelVariables.map((variable) => [variable.name, variable]))

  return Object.fromEntries(Object.entries(parameters).map(([name, value]) => [
    name,
    normalizeParameterValue(variableMap.get(name), value, modelVariables),
  ]))
}
