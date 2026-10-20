export function getFmiInitialValue(variable) {
  if (!variable || variable.start === undefined || variable.start === null) return undefined

  if (variable.type === 'Boolean' || typeof variable.start === 'boolean') {
    return variable.start === true || variable.start === 'true' || variable.start === 1 || variable.start === '1'
  }

  const numericStart = Number(variable.start)
  return Number.isFinite(numericStart) ? numericStart : undefined
}

export function isFmiBindingVisible(value, binding = {}) {
  if (Object.prototype.hasOwnProperty.call(binding, 'visibleWhenGreaterThanOrEqual')) {
    if (value === undefined || value === null) return false
    const threshold = Number(binding.visibleWhenGreaterThanOrEqual)
    const numericValue = Number(value)
    return Number.isFinite(threshold) && Number.isFinite(numericValue) && numericValue >= threshold
  }

  return Boolean(value)
}
