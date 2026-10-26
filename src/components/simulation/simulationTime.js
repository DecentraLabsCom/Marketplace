// Keep these simulation-tool fallbacks aligned with FMU-Executor/app/simulation_defaults.py.
const FALLBACK_SIMULATION_OPTIONS = Object.freeze({
  startTime: 0,
  stopDuration: 1,
  stepSize: 0.001,
})

function parseOptionalFiniteNumber(value) {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

/**
 * FMI DefaultExperiment values are optional. Use them when present and valid,
 * then fill any missing values with simulation-tool defaults.
 */
export function getInitialSimulationOptions(fmuMetadata = {}) {
  const startTime = parseOptionalFiniteNumber(fmuMetadata.defaultStartTime)
    ?? FALLBACK_SIMULATION_OPTIONS.startTime
  const declaredStopTime = parseOptionalFiniteNumber(fmuMetadata.defaultStopTime)
  const stopTime = declaredStopTime !== null && declaredStopTime > startTime
    ? declaredStopTime
    : startTime + FALLBACK_SIMULATION_OPTIONS.stopDuration
  const declaredStepSize = parseOptionalFiniteNumber(fmuMetadata.defaultStepSize)
  const stepSize = declaredStepSize !== null && declaredStepSize > 0
    ? declaredStepSize
    : FALLBACK_SIMULATION_OPTIONS.stepSize

  return { startTime, stopTime, stepSize }
}

export function getSimulationOptionsError(options, { includeStepSize = true } = {}) {
  const startTime = parseOptionalFiniteNumber(options?.startTime)
  if (startTime === null) return 'Enter a finite start time.'

  const stopTime = parseOptionalFiniteNumber(options?.stopTime)
  if (stopTime === null) return 'Enter a finite stop time.'
  if (stopTime <= startTime) return 'Stop time must be greater than start time.'

  if (includeStepSize) {
    const stepSize = parseOptionalFiniteNumber(options?.stepSize)
    if (stepSize === null || stepSize <= 0) return 'Step size must be greater than zero.'
  }

  return ''
}

export function normalizeSimulationTimeOptions(options, { includeStepSize = true } = {}) {
  const error = getSimulationOptionsError(options, { includeStepSize })
  if (error) throw new Error(error)

  return {
    startTime: Number(options.startTime),
    stopTime: Number(options.stopTime),
    ...(includeStepSize ? { stepSize: Number(options.stepSize) } : {}),
  }
}
