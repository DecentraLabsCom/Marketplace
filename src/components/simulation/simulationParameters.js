const NUMERIC_TYPES = new Set([
  'Real',
  'Float32',
  'Float64',
  'Integer',
  'Enumeration',
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
  'Enumeration',
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

export function getVariableDescription(variable) {
  const description = typeof variable?.description === 'string' ? variable.description.trim() : ''
  return description && description !== variable?.name ? description : ''
}

export function getVariableDisplayName(variable) {
  const displayName = typeof variable?.displayName === 'string' ? variable.displayName.trim() : ''
  return displayName && displayName !== variable?.name ? displayName : variable?.name || ''
}

export function getVariableDisplayUnit(variable) {
  const displayUnit = variable?.displayUnit
  if (displayUnit && typeof displayUnit === 'object' && displayUnit.inverse === true && variable?.causality === 'input') {
    return typeof variable?.unit === 'string' ? variable.unit : ''
  }
  if (typeof displayUnit === 'string' && displayUnit.trim()) {
    const normalizedDisplayUnit = displayUnit.trim()
    if (!variable?.unit || normalizedDisplayUnit === variable.unit) return normalizedDisplayUnit
    return variable.unit
  }
  if (typeof displayUnit?.name === 'string' && displayUnit.name.trim()) return displayUnit.name.trim()
  return typeof variable?.unit === 'string' ? variable.unit : ''
}

function getDisplayUnitTransform(variable) {
  const displayUnit = variable?.displayUnit
  if (!displayUnit || typeof displayUnit !== 'object') return null
  if (displayUnit.inverse === true && variable?.causality === 'input') return null
  const factor = Number(displayUnit.factor ?? 1)
  const offset = Number(displayUnit.offset ?? 0)
  const inverse = displayUnit.inverse === true
  return Number.isFinite(factor) && factor !== 0 && Number.isFinite(offset) && (!inverse || offset === 0)
    ? { factor, offset, inverse }
    : null
}

function transformNumericValue(variable, value, direction) {
  if (!NUMERIC_TYPES.has(variable?.type) || value === '' || value === null || value === undefined) return value
  const transform = getDisplayUnitTransform(variable)
  if (!transform) return value
  const convert = (item) => {
    const number = Number(item)
    if (!Number.isFinite(number)) return item
    if (transform.inverse) {
      if (direction === 'display') return number === 0 ? null : transform.factor / number
      return number === 0 ? '' : transform.factor / number
    }
    return direction === 'display'
      ? (transform.factor * number) + transform.offset
      : (number - transform.offset) / transform.factor
  }

  if (Array.isArray(value)) return value.map(convert)
  if (typeof value === 'string' && /[\s,]/.test(value.trim())) {
    const items = value.trim().split(/[\s,]+/).filter(Boolean)
    return items.map(convert).join(' ')
  }
  return convert(value)
}

export function toVariableDisplayValue(variable, value) {
  return transformNumericValue(variable, value, 'display')
}

export function fromVariableDisplayValue(variable, value) {
  return transformNumericValue(variable, value, 'model')
}

export function formatVariableDisplayValue(variable, value) {
  return formatParameterValue(toVariableDisplayValue(variable, value))
}

export function getVariableDisplayBounds(variable) {
  const transform = getDisplayUnitTransform(variable)
  const minimum = variable?.min == null ? null : Number(variable.min)
  const maximum = variable?.max == null ? null : Number(variable.max)
  const minIsFinite = minimum !== null && Number.isFinite(minimum)
  const maxIsFinite = maximum !== null && Number.isFinite(maximum)
  if (!transform) {
    return {
      min: minIsFinite ? variable.min : undefined,
      max: maxIsFinite ? variable.max : undefined,
    }
  }
  // Inverse display units are non-monotonic around zero, so native min/max
  // cannot always be represented as one safe display interval.
  if (transform.inverse) return { min: undefined, max: undefined }

  if (minIsFinite !== maxIsFinite) {
    const value = transform.factor * (minIsFinite ? minimum : maximum) + transform.offset
    return transform.factor > 0
      ? { min: minIsFinite ? value : undefined, max: maxIsFinite ? value : undefined }
      : { min: maxIsFinite ? value : undefined, max: minIsFinite ? value : undefined }
  }

  const displayed = [
    ...(minIsFinite ? [transform.factor * minimum + transform.offset] : []),
    ...(maxIsFinite ? [transform.factor * maximum + transform.offset] : []),
  ].sort((left, right) => left - right)
  return {
    min: displayed.length ? displayed[0] : undefined,
    max: displayed.length > 1 ? displayed[displayed.length - 1] : undefined,
  }
}

export function getVariableEnumerationItems(variable) {
  if (!Array.isArray(variable?.enumItems)) return []
  const rawMinimum = Number(variable?.min)
  const rawMaximum = Number(variable?.max)
  const hasMinimum = variable?.min != null && Number.isFinite(rawMinimum)
  const hasMaximum = variable?.max != null && Number.isFinite(rawMaximum)
  return variable.enumItems.filter((item) => (
      Number.isInteger(Number(item?.value))
      && typeof item?.name === 'string'
      && item.name.trim().length > 0
      && (!hasMinimum || Number(item.value) >= rawMinimum)
      && (!hasMaximum || Number(item.value) <= rawMaximum)
  ))
}

export function getVariableEnumerationLabel(variable, value) {
  if (String(variable?.type).toLowerCase() !== 'enumeration') return null
  if (value === null || value === undefined || value === '') return null
  const numericValue = Number(value)
  if (!Number.isInteger(numericValue)) return null
  const item = getVariableEnumerationItems(variable).find((option) => Number(option.value) === numericValue)
  return item ? (item.description || item.name) : null
}

export function getVariableInputDetails(variable, modelVariables = []) {
  const valueCount = getVariableValueCount(variable, modelVariables)
  const type = variable?.type || 'Value'
  const shape = valueCount > 1 ? `vector[${valueCount}]` : 'scalar'
  const normalizedType = String(variable?.type || '').toLowerCase()
  const enumItems = getVariableEnumerationItems(variable)
  let format = 'a value'

  if (valueCount > 1) {
    const valueLabel = INTEGER_TYPES.has(variable?.type) ? 'whole numbers' : 'numbers'
    format = `${valueCount} ${valueLabel} separated by spaces`
  } else if (normalizedType === 'enumeration' && enumItems.length > 0) {
    format = 'one of the listed options'
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
  const bounds = getVariableDisplayBounds(variable)
  if (enumItems.length === 0 && bounds.min != null && bounds.max != null) {
    range = `Allowed: ${bounds.min} to ${bounds.max}`
  } else if (enumItems.length === 0 && bounds.min != null) {
    range = `Minimum: ${bounds.min}`
  } else if (enumItems.length === 0 && bounds.max != null) {
    range = `Maximum: ${bounds.max}`
  }

  return {
    valueCount,
    enumItems,
    inputType: enumItems.length > 0 && normalizedType === 'enumeration'
      ? 'select'
      : valueCount > 1 || !NUMERIC_TYPES.has(variable?.type) ? 'text' : 'number',
    step: valueCount > 1 || !NUMERIC_TYPES.has(variable?.type)
      ? undefined
      : INTEGER_TYPES.has(variable?.type) ? 1 : 'any',
    min: valueCount === 1 ? bounds.min : undefined,
    max: valueCount === 1 ? bounds.max : undefined,
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

function normalizeScalarParameterValue(variable, value) {
  const normalized = coerceParameterValue(value, variable)

  if (NUMERIC_TYPES.has(variable?.type) && typeof normalized !== 'number') {
    throw new Error(`Input ${variable.name} must be a finite number.`)
  }

  if (INTEGER_TYPES.has(variable?.type) && !Number.isInteger(normalized)) {
    throw new Error(`Input ${variable.name} must be a whole number.`)
  }

  const enumItems = getVariableEnumerationItems(variable)
  if (String(variable?.type).toLowerCase() === 'enumeration' && enumItems.length > 0
    && !enumItems.some((item) => Number(item.value) === normalized)) {
    throw new Error(`Input ${variable.name} must match one of the declared options.`)
  }

  if (NUMERIC_TYPES.has(variable?.type) && typeof normalized === 'number') {
    const minimum = Number(variable.min)
    const maximum = Number(variable.max)
    if (Number.isFinite(minimum) && normalized < minimum) {
      throw new Error(`Input ${variable.name} must be between ${minimum} and ${Number.isFinite(maximum) ? maximum : 'the maximum'}.`)
    }
    if (Number.isFinite(maximum) && normalized > maximum) {
      throw new Error(`Input ${variable.name} must be between ${Number.isFinite(minimum) ? minimum : 'the minimum'} and ${maximum}.`)
    }
  }

  return normalized
}

export function normalizeParameterValue(variable, value, modelVariables = []) {
  const valueCount = getVariableValueCount(variable, modelVariables)
  if (valueCount === 1) return normalizeScalarParameterValue(variable, value)

  const values = Array.isArray(value)
    ? value
    : String(value ?? '').trim().split(/[\s,]+/).filter(Boolean)

  if (values.length !== valueCount) {
    throw new Error(`Input ${variable.name} requires ${valueCount} values separated by spaces.`)
  }

  return values.map((item) => normalizeScalarParameterValue(variable, item))
}

export function normalizeSimulationParameters(parameters, modelVariables = []) {
  const variableMap = new Map(modelVariables.map((variable) => [variable.name, variable]))

  return Object.fromEntries(Object.entries(parameters).map(([name, value]) => [
    name,
    normalizeParameterValue(variableMap.get(name), value, modelVariables),
  ]))
}

export function normalizeInputSchedule(events, inputVariables, modelVariables = [], startTime = 0, stopTime, stepSize) {
  if (!Array.isArray(events) || events.length > 128) {
    throw new Error('A simulation can contain at most 128 scheduled input changes.')
  }

  const allowedVariables = new Map(inputVariables.map((variable) => [variable.name, variable]))
  const groupedEvents = new Map()
  const start = Number(startTime)
  const stop = Number(stopTime)
  const step = stepSize === '' || stepSize === null || stepSize === undefined ? null : Number(stepSize)

  for (const event of events) {
    const time = Number(event?.time)
    const variable = allowedVariables.get(event?.variable)
    if (!variable) throw new Error('A scheduled change refers to an input that is not available in this FMU.')
    if (!Number.isFinite(time) || !Number.isFinite(start) || !Number.isFinite(stop) || time < start || time >= stop) {
      throw new Error(`The scheduled change for ${variable.name} must occur between ${start} s and the end of the simulation.`)
    }

    if (Number.isFinite(step) && step > 0) {
      const stepIndex = Math.round((time - start) / step)
      const alignedTime = start + stepIndex * step
      const tolerance = Math.max(1e-9, Math.abs(step) * 1e-7)
      if (Math.abs(alignedTime - time) > tolerance) {
        throw new Error(`The scheduled change for ${variable.name} must align with a simulation step of ${step} s.`)
      }
    }

    let normalizedValue
    try {
      normalizedValue = normalizeParameterValue(variable, event.value, modelVariables)
    } catch (error) {
      throw new Error(`Scheduled value for ${variable.name}: ${error.message}`)
    }

    const timeKey = String(time)
    const values = groupedEvents.get(timeKey) || { time, values: {} }
    if (Object.prototype.hasOwnProperty.call(values.values, variable.name)) {
      throw new Error(`There is more than one scheduled value for ${variable.name} at ${time} s.`)
    }
    values.values[variable.name] = normalizedValue
    groupedEvents.set(timeKey, values)
  }

  return [...groupedEvents.values()].sort((left, right) => left.time - right.time)
}
