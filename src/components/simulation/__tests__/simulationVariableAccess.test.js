import {
  canWriteVariableAt,
  filterModelVariablesByAccess,
  getInitializationEditableVariables,
  getRuntimeWritableInputVariables,
} from '../simulationVariableAccess'

const variables = [
  { name: 'command', causality: 'input', start: 0 },
  { name: 'internalState', causality: 'local', start: 12 },
  { name: 'temperature', causality: 'output', start: 20 },
  { name: 'fixedGain', causality: 'parameter', variability: 'constant', start: 2 },
]

test('only includes readable or writable variables and hides unreadable start values', () => {
  const visible = filterModelVariablesByAccess(variables, {
    variables: {
      command: { read: false, writeAt: ['initialization'] },
      internalState: { read: false, writeAt: [] },
      temperature: { read: true, writeAt: [] },
      fixedGain: { read: false, writeAt: [] },
    },
  })

  expect(visible).toEqual([
    { name: 'command', causality: 'input' },
    { name: 'temperature', causality: 'output', start: 20 },
  ])
})

test('write phases are explicit and restricted to the named variable', () => {
  const access = { variables: { command: { read: false, writeAt: ['initialization'] } } }
  expect(canWriteVariableAt(access, 'command', 'initialization')).toBe(true)
  expect(canWriteVariableAt(access, 'command', 'runtime')).toBe(false)
  expect(canWriteVariableAt(access, 'internalState', 'initialization')).toBe(false)
})

test('classifies controls across FMI causality, variability, and read/write phases', () => {
  const modelVariables = [
    { name: 'readOnlyInput', causality: 'input', variability: 'continuous', start: 1 },
    { name: 'runtimeInput', causality: 'input', variability: 'discrete', start: 2 },
    { name: 'initializationInput', causality: 'input', variability: 'constant', start: 3 },
    { name: 'fixedParameter', causality: 'parameter', variability: 'fixed', start: 4 },
    { name: 'tunableParameter', causality: 'parameter', variability: 'tunable', start: 5 },
    { name: 'constantParameter', causality: 'parameter', variability: 'constant', start: 6 },
    { name: 'calculatedParameter', causality: 'calculatedParameter', variability: 'fixed', start: 7 },
    { name: 'readableOutput', causality: 'output', variability: 'continuous', start: 8 },
    { name: 'privateOutput', causality: 'output', variability: 'continuous', start: 9 },
    { name: 'independentTime', causality: 'independent', variability: 'continuous', start: 10 },
    { name: 'privateLocal', causality: 'local', variability: 'continuous', start: 11 },
    { name: 'structural', causality: 'structuralParameter', variability: 'fixed', start: 12 },
  ]
  const access = {
    variables: {
      readOnlyInput: { read: true, writeAt: [] },
      runtimeInput: { read: false, writeAt: ['runtime'] },
      initializationInput: { read: false, writeAt: ['initialization'] },
      fixedParameter: { read: false, writeAt: ['initialization'] },
      tunableParameter: { read: true, writeAt: ['initialization'] },
      constantParameter: { read: true, writeAt: [] },
      calculatedParameter: { read: true, writeAt: [] },
      readableOutput: { read: true, writeAt: [] },
      privateOutput: { read: false, writeAt: [] },
      independentTime: { read: true, writeAt: [] },
      privateLocal: { read: false, writeAt: [] },
      structural: { read: true, writeAt: [] },
    },
  }

  expect(getInitializationEditableVariables(modelVariables, access).map(({ name }) => name)).toEqual([
    'initializationInput',
    'fixedParameter',
    'tunableParameter',
  ])
  expect(getRuntimeWritableInputVariables(modelVariables, access).map(({ name }) => name)).toEqual([
    'runtimeInput',
  ])
  expect(filterModelVariablesByAccess(modelVariables, access).map(({ name }) => name)).toEqual([
    'readOnlyInput',
    'runtimeInput',
    'initializationInput',
    'fixedParameter',
    'tunableParameter',
    'constantParameter',
    'calculatedParameter',
    'readableOutput',
    'independentTime',
    'structural',
  ])
})
