/**
 * Shared contract for glTF node extras named `fmiBindings`: scene coordinates
 * map to FMI values with position = value * scale + offset. Direct manipulation
 * applies the inverse mapping to uniquely bound numeric inputs. See the
 * canonical specification in docs/provider/fmi-glb-bindings-contract.md.
 */
const FMI_SCENE_BINDING_TARGETS = new Set([
  'position.x', 'position.y', 'position.z',
  'rotation.x', 'rotation.y', 'rotation.z',
  'scale.x', 'scale.y', 'scale.z',
  'visible',
  'material.color',
])

const POSITION_TARGET_PATTERN = /^position\.([xyz])$/
const NUMERIC_INPUT_TYPES = new Set([
  'real', 'integer', 'float32', 'float64',
  'int8', 'int16', 'int32', 'int64',
  'uint8', 'uint16', 'uint32', 'uint64',
])
const INTEGER_INPUT_TYPES = new Set([
  'integer', 'int8', 'int16', 'int32', 'int64', 'uint8', 'uint16', 'uint32', 'uint64',
])
const MAX_SCENE_COORDINATE = 100_000

function numericValue(value) {
  if (typeof value === 'boolean') return value ? 1 : 0
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function getBindingNumber(value, fallback) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback
}

function isFiniteBindingNumber(value) {
  return typeof value === 'number' && Number.isFinite(value)
}

function isBindingColor(value) {
  if (typeof value === 'string') return value.trim().length > 0
  return typeof value === 'number'
    && Number.isInteger(value)
    && value >= 0
    && value <= 0xffffff
}

function hasValidBindingFields(binding) {
  for (const field of ['scale', 'offset', 'visibleWhenGreaterThanOrEqual']) {
    if (Object.prototype.hasOwnProperty.call(binding, field) && !isFiniteBindingNumber(binding[field])) {
      return false
    }
  }
  for (const field of ['trueColor', 'falseColor']) {
    if (Object.prototype.hasOwnProperty.call(binding, field) && !isBindingColor(binding[field])) {
      return false
    }
  }
  return true
}

function getVariableBound(variable, key) {
  if (variable?.[key] === null || variable?.[key] === undefined || variable?.[key] === '') return null
  const value = Number(variable[key])
  return Number.isFinite(value) ? value : null
}

export function normalizeFmiSceneBinding(binding, variable) {
  if (!binding || typeof binding !== 'object' || Array.isArray(binding)
    || typeof binding.variable !== 'string'
    || binding.variable !== variable?.name
    || !hasValidBindingFields(binding)
    || !FMI_SCENE_BINDING_TARGETS.has(binding.target)) return null

  const positionMatch = POSITION_TARGET_PATTERN.exec(binding.target)
  const [property, axis] = binding.target.split('.')

  return {
    binding,
    variable,
    target: binding.target,
    property,
    axis: positionMatch?.[1] || null,
    scale: getBindingNumber(binding.scale, 1),
    offset: getBindingNumber(binding.offset, 0),
  }
}

export function getFmiSceneBoundValue(value, normalizedBinding) {
  const numeric = numericValue(value)
  if (numeric === null || !normalizedBinding) return null
  return numeric * normalizedBinding.scale + normalizedBinding.offset
}

export function isDraggableFmiSceneBinding(normalizedBinding) {
  const type = String(normalizedBinding?.variable?.type || '').toLowerCase()
  return normalizedBinding?.variable?.causality === 'input'
    && normalizedBinding.property === 'position'
    && ['x', 'y', 'z'].includes(normalizedBinding.axis)
    && NUMERIC_INPUT_TYPES.has(type)
    && Number.isFinite(normalizedBinding.scale)
    && normalizedBinding.scale !== 0
}

export function getFmiSceneInputValueFromPosition(position, normalizedBinding) {
  if (!isDraggableFmiSceneBinding(normalizedBinding)) return null
  const sceneCoordinate = Number(position)
  if (!Number.isFinite(sceneCoordinate) || Math.abs(sceneCoordinate) > MAX_SCENE_COORDINATE) return null

  const variableValue = (sceneCoordinate - normalizedBinding.offset) / normalizedBinding.scale
  if (!Number.isFinite(variableValue)) return null

  const minimum = getVariableBound(normalizedBinding.variable, 'min')
  const maximum = getVariableBound(normalizedBinding.variable, 'max')
  if (minimum !== null && maximum !== null && minimum > maximum) return null

  const type = String(normalizedBinding.variable.type || '').toLowerCase()
  if (!INTEGER_INPUT_TYPES.has(type)) {
    return Math.min(maximum ?? Infinity, Math.max(minimum ?? -Infinity, variableValue))
  }

  const integerMinimum = minimum === null ? null : Math.ceil(minimum)
  const integerMaximum = maximum === null ? null : Math.floor(maximum)
  if (integerMinimum !== null && integerMaximum !== null && integerMinimum > integerMaximum) return null
  return Math.min(integerMaximum ?? Infinity, Math.max(integerMinimum ?? -Infinity, Math.round(variableValue)))
}
