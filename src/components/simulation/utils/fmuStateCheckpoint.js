export function createFmuStateSample(time, outputs) {
  if (!Number.isFinite(Number(time)) || !outputs || typeof outputs !== 'object' || Array.isArray(outputs)) {
    return null
  }

  const scalarOutputs = Object.fromEntries(Object.entries(outputs).filter(([, value]) => (
    typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value))
  )))
  return { time: Number(time), outputs: scalarOutputs }
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
