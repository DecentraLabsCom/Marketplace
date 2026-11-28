import { normalizeFmiLsExperiments } from './fmiLsExperiments'

const experiment = {
  id: 'experiment-1-1',
  name: 'Tolerance test',
  parameters: {},
  options: { startTime: 0, stopTime: 1, stepSize: 0.01, tolerance: 1e-7 },
}

test('preserves finite positive experiment tolerance', () => {
  expect(normalizeFmiLsExperiments([experiment])[0].options).toEqual(experiment.options)
})

test.each([0, -1, Infinity, NaN, true, '1e-6'])('rejects invalid experiment tolerance %p', (tolerance) => {
  expect(normalizeFmiLsExperiments([{ ...experiment, options: { tolerance } }])).toEqual([])
})
