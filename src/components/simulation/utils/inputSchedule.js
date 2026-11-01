import { normalizeParameterValue } from './simulationParameters'

export function normalizeInputSchedule(events, scheduledVariables, modelVariables = [], startTime = 0, stopTime, stepSize) {
  if (!Array.isArray(events) || events.length > 128) {
    throw new Error('A simulation can contain at most 128 scheduled changes.')
  }

  const allowedVariables = new Map(scheduledVariables.map((variable) => [variable.name, variable]))
  const groupedEvents = new Map()
  const start = Number(startTime)
  const stop = Number(stopTime)
  const step = stepSize === '' || stepSize === null || stepSize === undefined ? null : Number(stepSize)

  for (const event of events) {
    const time = Number(event?.time)
    const variable = allowedVariables.get(event?.variable)
    if (!variable) throw new Error('A scheduled change refers to a variable that is not available for runtime changes in this FMU.')
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
      throw new Error(`There is more than one scheduled change for ${variable.name} at ${time} s.`)
    }
    values.values[variable.name] = normalizedValue
    groupedEvents.set(timeKey, values)
  }

  return [...groupedEvents.values()].sort((left, right) => left.time - right.time)
}

/** Combine a model-declared experiment stimulus with user-entered changes; user changes win on collisions. */
export function mergeInputSchedules(baseSchedule = [], overrideSchedule = []) {
  const merged = new Map()
  for (const schedule of [baseSchedule, overrideSchedule]) {
    for (const event of schedule) {
      const time = Number(event?.time)
      if (!Number.isFinite(time) || !event?.values || typeof event.values !== 'object' || Array.isArray(event.values)) {
        throw new Error('The selected experiment contains an invalid input schedule.')
      }
      const key = String(time)
      const current = merged.get(key) || { time, values: {} }
      Object.assign(current.values, event.values)
      merged.set(key, current)
    }
  }
  const result = [...merged.values()].sort((left, right) => left.time - right.time)
  if (result.length > 128) throw new Error('An experiment and its scheduled changes can contain at most 128 time points.')
  return result
}

export function inputScheduleToEvents(schedule) {
  if (!Array.isArray(schedule)) return []
  return schedule.flatMap((event) => (
    event?.values && typeof event.values === 'object' && !Array.isArray(event.values)
      ? Object.entries(event.values).map(([variable, value]) => ({ time: event.time, variable, value }))
      : []
  ))
}

/** Validate and combine a selected FMI-LS experiment stimulus with user changes. */
export function resolveInputSchedule({
  experiment = null,
  inputEvents = [],
  scheduleVariables = [],
  modelVariables = [],
  options = {},
  ignoreEventsBeforeStartTime = false,
  enabled = true,
} = {}) {
  if (!enabled) return []

  const runtimeVariables = Array.isArray(scheduleVariables) ? scheduleVariables : []
  const declaredVariables = Array.isArray(modelVariables) ? modelVariables : []
  const startTime = Number(options.startTime)
  const keepEvent = (event) => {
    const eventTime = Number(event?.time)
    return !ignoreEventsBeforeStartTime
      || !Number.isFinite(startTime)
      || !Number.isFinite(eventTime)
      || eventTime >= startTime
  }
  const experimentEvents = normalizeInputSchedule(
    inputScheduleToEvents(experiment?.inputSchedule).filter(keepEvent),
    runtimeVariables,
    declaredVariables,
    options.startTime,
    options.stopTime,
    options.stepSize,
  )
  const manualEvents = normalizeInputSchedule(
    Array.isArray(inputEvents) ? inputEvents.filter(keepEvent) : inputEvents,
    runtimeVariables,
    declaredVariables,
    options.startTime,
    options.stopTime,
    options.stepSize,
  )

  return mergeInputSchedules(experimentEvents, manualEvents)
}
