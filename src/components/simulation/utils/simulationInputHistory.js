import { isGraphableVariable } from './simulationGraphData'

/** Records the input values in force at each sample time, including scheduled changes. */
export function createSimulationInputHistory({
  modelVariables = [],
  initialValues = {},
  inputSchedule = [],
} = {}) {
  const inputNames = modelVariables
    .filter((variable) => variable?.causality === 'input' && isGraphableVariable(variable, modelVariables))
    .map((variable) => variable.name)
  const inputValues = Object.fromEntries(inputNames.map((name) => [
    name,
    initialValues[name] !== undefined && initialValues[name] !== null && initialValues[name] !== ''
      ? initialValues[name]
      : modelVariables.find((variable) => variable.name === name)?.start ?? null,
  ]))
  const inputs = Object.fromEntries(inputNames.map((name) => [name, []]))
  const schedule = [...(Array.isArray(inputSchedule) ? inputSchedule : [])]
    .filter((event) => Number.isFinite(Number(event?.time)))
    .sort((left, right) => Number(left.time) - Number(right.time))
  let scheduleIndex = 0

  return {
    inputs,
    append(sampleTimes = []) {
      for (const rawTime of sampleTimes) {
        const time = Number(rawTime)
        if (!Number.isFinite(time)) continue
        while (scheduleIndex < schedule.length && Number(schedule[scheduleIndex].time) <= time + 1e-12) {
          Object.entries(schedule[scheduleIndex].values || {}).forEach(([name, value]) => {
            if (Object.prototype.hasOwnProperty.call(inputValues, name)) inputValues[name] = value
          })
          scheduleIndex += 1
        }
        inputNames.forEach((name) => inputs[name].push(inputValues[name] ?? null))
      }
    },
  }
}
