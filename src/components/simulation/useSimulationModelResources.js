import { useMemo } from 'react'
import { mergeAasSimulationVariables } from './aasSimulationVariables'
import {
  filterModelVariablesByAccess,
  getInitializationEditableVariables,
  getRuntimeWritableVariables,
} from './simulationVariableAccess'
import {
  filterFmiLsExperimentsForVariables,
  filterFmiLsParameterPresets,
} from '@/utils/fmiLsEligibility'

const EMPTY_LIST = []

/** Derive the access-filtered variables and FMI-LS resources used by simulation views. */
export default function useSimulationModelResources({
  modelVariables = EMPTY_LIST,
  access = null,
  parameterPresets = EMPTY_LIST,
  experiments = access?.fmiLsExperiments,
  aasSimulationVariables = EMPTY_LIST,
} = {}) {
  const variableList = Array.isArray(modelVariables) ? modelVariables : EMPTY_LIST
  const presetList = Array.isArray(parameterPresets) ? parameterPresets : EMPTY_LIST
  const experimentList = Array.isArray(experiments) ? experiments : EMPTY_LIST

  const accessibleModelVariables = useMemo(
    () => filterModelVariablesByAccess(variableList, access),
    [variableList, access],
  )
  const editableVariables = useMemo(
    () => getInitializationEditableVariables(accessibleModelVariables, access),
    [accessibleModelVariables, access],
  )
  const editableFmiLsParameterPresets = useMemo(
    () => filterFmiLsParameterPresets(presetList, editableVariables),
    [editableVariables, presetList],
  )
  const scheduledRuntimeVariables = useMemo(
    () => getRuntimeWritableVariables(accessibleModelVariables, access),
    [accessibleModelVariables, access],
  )
  const fmiLsExperiments = useMemo(
    () => filterFmiLsExperimentsForVariables(experimentList, editableVariables, scheduledRuntimeVariables),
    [editableVariables, experimentList, scheduledRuntimeVariables],
  )
  const twinVariableResolution = useMemo(
    () => mergeAasSimulationVariables(aasSimulationVariables, variableList),
    [aasSimulationVariables, variableList],
  )
  const twinModelVariables = useMemo(
    () => filterModelVariablesByAccess(twinVariableResolution.variables, access),
    [twinVariableResolution.variables, access],
  )
  const twinEditableVariables = useMemo(
    () => getInitializationEditableVariables(twinModelVariables, access),
    [twinModelVariables, access],
  )
  const twinEditableVariableNames = useMemo(
    () => new Set(twinEditableVariables.map((variable) => variable.name)),
    [twinEditableVariables],
  )
  // Keep the current gateway authorization basis for runtime writes. AAS data is
  // presentation metadata and must not widen the set of variables the FMU permits.
  const twinScheduledRuntimeVariables = useMemo(
    () => getRuntimeWritableVariables(accessibleModelVariables, access),
    [accessibleModelVariables, access],
  )
  const twinFmiLsParameterPresets = useMemo(
    () => filterFmiLsParameterPresets(presetList, twinEditableVariableNames),
    [presetList, twinEditableVariableNames],
  )
  const twinFmiLsExperiments = useMemo(
    () => filterFmiLsExperimentsForVariables(
      experimentList,
      twinEditableVariableNames,
      twinScheduledRuntimeVariables,
    ),
    [experimentList, twinEditableVariableNames, twinScheduledRuntimeVariables],
  )

  return {
    accessibleModelVariables,
    editableVariables,
    editableFmiLsParameterPresets,
    scheduledRuntimeVariables,
    fmiLsExperiments,
    twinVariableResolution,
    twinModelVariables,
    twinEditableVariables,
    twinEditableVariableNames,
    twinScheduledRuntimeVariables,
    twinFmiLsParameterPresets,
    twinFmiLsExperiments,
  }
}
