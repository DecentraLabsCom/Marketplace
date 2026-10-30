function variableNameSet(variablesOrNames) {
  const values = variablesOrNames instanceof Set
    ? [...variablesOrNames]
    : Array.isArray(variablesOrNames) ? variablesOrNames : []
  return new Set(values.map((value) => (
    typeof value === 'string' ? value : value?.name
  )).filter((name) => typeof name === 'string' && name.length > 0))
}

/** Keep complete FMI-LS-REF parameter sets whose values can be edited here. */
export function filterFmiLsParameterPresets(parameterPresets, editableVariablesOrNames) {
  if (!Array.isArray(parameterPresets)) return []
  const editableNames = variableNameSet(editableVariablesOrNames)
  return parameterPresets.filter((preset) => (
    preset && typeof preset === 'object' && !Array.isArray(preset)
    && preset.parameters && typeof preset.parameters === 'object' && !Array.isArray(preset.parameters)
    && Object.keys(preset.parameters).length > 0
    && Object.keys(preset.parameters).every((name) => editableNames.has(name))
  ))
}

/** Keep experiments only when every parameter they set is editable here. */
export function filterFmiLsExperimentsForVariables(experiments, editableVariablesOrNames, runtimeVariablesOrNames = []) {
  if (!Array.isArray(experiments)) return []
  const editableNames = variableNameSet(editableVariablesOrNames)
  const runtimeNames = variableNameSet(runtimeVariablesOrNames)
  return experiments.filter((experiment) => (
    experiment && typeof experiment === 'object' && !Array.isArray(experiment)
    && experiment.parameters && typeof experiment.parameters === 'object' && !Array.isArray(experiment.parameters)
    && Object.keys(experiment.parameters).every((name) => editableNames.has(name))
    && (experiment.inputSchedule === undefined || (
      Array.isArray(experiment.inputSchedule)
      && experiment.inputSchedule.length > 0
      && experiment.inputSchedule.every((event) => (
        event && typeof event === 'object' && !Array.isArray(event)
        && Number.isFinite(event.time)
        && event.values && typeof event.values === 'object' && !Array.isArray(event.values)
        && Object.keys(event.values).length > 0
        && Object.entries(event.values).every(([name, value]) => (
          runtimeNames.has(name) && typeof value === 'number' && Number.isFinite(value)
        ))
      ))
    ))
  ))
}

export function supportsFmiLsInteractiveModes(simulationType, fmiVersion) {
  const majorVersion = String(fmiVersion || '').match(/^\s*(\d+)\./)?.[1]
  return simulationType === 'CoSimulation' && ['2', '3'].includes(majorVersion)
}

export function canScheduleFmiLsInputChanges(enabled, variables, executionMode) {
  return enabled === true
    && Array.isArray(variables)
    && variables.some((variable) => typeof variable?.name === 'string' && variable.name.length > 0)
    && (executionMode === undefined || executionMode === 'batch')
}
