export function appendSimulationSamples(accumulatedTime, accumulatedOutputs, times, outputs, valuesAreSeries = true) {
  const sampleTimes = Array.isArray(times) ? times : [times]
  if (sampleTimes.length === 0 || !outputs || typeof outputs !== 'object' || Array.isArray(outputs)) return false

  const outputNames = new Set([...Object.keys(accumulatedOutputs), ...Object.keys(outputs)])
  for (let index = 0; index < sampleTimes.length; index += 1) {
    const sampleTime = Number(sampleTimes[index])
    if (!Number.isFinite(sampleTime)) continue
    const previousCount = accumulatedTime.length
    accumulatedTime.push(sampleTime)
    for (const name of outputNames) {
      const series = accumulatedOutputs[name] || Array(previousCount).fill(null)
      const incoming = outputs[name]
      const value = valuesAreSeries && Array.isArray(incoming) ? incoming[index] : incoming
      series.push(value === undefined ? null : value)
      accumulatedOutputs[name] = series
    }
  }
  return true
}
