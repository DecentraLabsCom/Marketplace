import {
  formatVariableDisplayValue,
  getLeastSignificantDigitStep,
  getVariableDisplayBounds,
  getVariableInputDetails,
  getVariableEnumerationItems,
  isIntegerVariableType,
  isNumericVariableType,
  toVariableDisplayValue,
} from './simulationParameters'

function getVariableWheelStep(variable, value) {
  const currentStep = getLeastSignificantDigitStep(toVariableDisplayValue(variable, value))
  const declaredStartStep = getLeastSignificantDigitStep(
    toVariableDisplayValue(variable, variable.start),
  )
  return Math.min(currentStep, declaredStartStep)
}

/** Resolve FMI variable metadata and edit semantics shared by runner and twin inputs. */
export function getVariableEditorModel(variable, modelVariables = [], value) {
  const details = getVariableInputDetails(variable, modelVariables)
  const valueCount = details.valueCount
  const isNumeric = isNumericVariableType(variable?.type)
  const isInteger = isIntegerVariableType(variable?.type)
  const isScalar = valueCount === 1
  const isScalarNumber = isNumeric && isScalar
  const isBooleanType = String(variable?.type || '').toLowerCase() === 'boolean'
  const isBoolean = isBooleanType && isScalar
  const isEnumeration = String(variable?.type || '').toLowerCase() === 'enumeration'
  const enumItems = getVariableEnumerationItems(variable)
  const scalarEnumItems = isScalar ? enumItems : []
  const bounds = getVariableDisplayBounds(variable)
  const min = Number(bounds.min)
  const max = Number(bounds.max)
  const hasRange = isScalarNumber
    && Number.isFinite(min)
    && Number.isFinite(max)
    && max > min
  const displayValue = toVariableDisplayValue(variable, value)
  const numericDisplayValue = Number(displayValue)
  const wheelStep = !isNumeric ? undefined : isInteger ? 1 : getVariableWheelStep(variable, value)
  const rangeStep = !hasRange ? undefined : isInteger
    ? 1
    : Math.max(Math.min((max - min) / 100, 0.01), 0.000001)

  return {
    ...details,
    valueCount,
    isNumeric,
    isInteger,
    isScalar,
    isScalarNumber,
    isBoolean,
    isBooleanType,
    isEnumeration,
    enumItems,
    scalarEnumItems,
    bounds,
    min,
    max,
    hasRange,
    displayValue,
    numericDisplayValue,
    formattedValue: formatVariableDisplayValue(variable, value),
    formattedNumericValue: Number.isFinite(numericDisplayValue)
      ? numericDisplayValue
      : String(value ?? '—'),
    wheelStep,
    inputStep: isScalarNumber ? wheelStep : undefined,
    rangeStep,
  }
}

export function getVariableVectorEditorValues(value, valueCount) {
  const values = Array.isArray(value)
    ? value.flat(Infinity)
    : typeof value === 'string' && /[\s,]/.test(value.trim())
      ? value.trim().split(/[\s,]+/).filter(Boolean)
      : value === undefined || value === null || value === ''
        ? []
        : [value]

  return Array.from({ length: valueCount }, (_, index) => values[index] ?? '')
}
