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
export function filterFmiLsExperimentsForVariables(experiments, editableVariablesOrNames) {
  if (!Array.isArray(experiments)) return []
  const editableNames = variableNameSet(editableVariablesOrNames)
  return experiments.filter((experiment) => (
    experiment && typeof experiment === 'object' && !Array.isArray(experiment)
    && experiment.parameters && typeof experiment.parameters === 'object' && !Array.isArray(experiment.parameters)
    && Object.keys(experiment.parameters).every((name) => editableNames.has(name))
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
