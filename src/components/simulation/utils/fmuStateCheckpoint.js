export function createFmuStateSample(time, outputs) {
  if (!Number.isFinite(Number(time)) || !outputs || typeof outputs !== 'object' || Array.isArray(outputs)) {
    return null
  }

  const scalarOutputs = Object.fromEntries(Object.entries(outputs).filter(([, value]) => (
    typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value))
  )))
  return { time: Number(time), outputs: scalarOutputs }
}

export function createFmuStateCheckpointCandidate(event, initialValues = {}, inputSchedule = []) {
  if (!event?.checkpoint || !Number.isFinite(Number(event.checkpointTime))) return null
  const sample = createFmuStateSample(event.checkpointTime, event.checkpointOutputs)
  if (!sample) return null

  const modelValues = createFmuStateModelValues(initialValues, inputSchedule, sample.time)
  return {
    version: 1,
    simTime: sample.time,
    checkpoint: event.checkpoint,
    sample,
    ...(Object.keys(modelValues).length ? { modelValues } : {}),
  }
}

function isCheckpointModelValue(value) {
  return typeof value === 'boolean'
    || (typeof value === 'number' && Number.isFinite(value))
    || (typeof value === 'string' && value.length <= 1024)
}

export function filterFmuStateModelValues(modelValues, variableNames) {
  if (!modelValues || typeof modelValues !== 'object' || Array.isArray(modelValues)) return {}
  const allowedNames = variableNames ? new Set(variableNames) : null
  return Object.fromEntries(Object.entries(modelValues)
    .filter(([name, value]) => name.length > 0 && name.length <= 256
      && (!allowedNames || allowedNames.has(name))
      && isCheckpointModelValue(value))
    .slice(0, 256))
}

export function createFmuStateModelValues(initialValues, inputSchedule = [], simTime = Infinity) {
  const modelValues = filterFmuStateModelValues(initialValues)
  if (!Array.isArray(inputSchedule)) return modelValues
  for (const event of inputSchedule) {
    if (!event || !Number.isFinite(Number(event.time)) || Number(event.time) > simTime + 1e-12) continue
    Object.assign(modelValues, filterFmuStateModelValues(event.values))
  }
  return modelValues
}

export function createFmuStateResults(sample, fmiType) {
  if (!sample || !Number.isFinite(sample.time) || !sample.outputs || typeof sample.outputs !== 'object') return null
  const outputs = Object.fromEntries(Object.entries(sample.outputs).map(([name, value]) => [name, [value]]))
  return {
    time: [sample.time],
    outputs,
    outputVariables: Object.keys(outputs),
    simulationTime: sample.time,
    ...(fmiType ? { fmiType } : {}),
  }
}
