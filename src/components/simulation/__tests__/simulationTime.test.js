import {
  getInitialSimulationOptions,
  getSimulationOptionsError,
  normalizeSimulationTimeOptions,
} from '../utils/simulationTime'

test('uses the Executor fallback values when the FMU declares no default experiment', () => {
  expect(getInitialSimulationOptions()).toEqual({
    startTime: 0,
    stopTime: 1,
    stepSize: 0.001,
  })
})

test('uses the FMU defaults and fills missing values with matching Executor fallbacks', () => {
  expect(getInitialSimulationOptions({
    defaultStartTime: 3,
    defaultStepSize: 0.25,
  })).toEqual({
    startTime: 3,
    stopTime: 4,
    stepSize: 0.25,
  })
})

test('replaces invalid FMU stop and step defaults with the Executor fallbacks', () => {
  expect(getInitialSimulationOptions({
    defaultStartTime: 3,
    defaultStopTime: 3,
    defaultStepSize: 0,
  })).toEqual({
    startTime: 3,
    stopTime: 4,
    stepSize: 0.001,
  })
})

test('preserves a selected experiment tolerance in normalized execution options', () => {
  expect(normalizeSimulationTimeOptions({ startTime: 0, stopTime: 1, stepSize: 0.1, tolerance: '1e-7' }))
    .toEqual({ startTime: 0, stopTime: 1, stepSize: 0.1, tolerance: 1e-7 })
  expect(getSimulationOptionsError({ startTime: 0, stopTime: 1, stepSize: 0.1, tolerance: 0 })).toMatch(/Relative tolerance/)
})
