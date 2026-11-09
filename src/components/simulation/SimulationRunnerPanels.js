import FmiLsStructMapPanel from '@/components/fmi-ls/FmiLsStructMapPanel'
import FmiLsResourceSelect from './controls/FmiLsResourceSelect'
import DigitalTwinSimulationForm from './controls/DigitalTwinSimulationForm'
import SimulationProgress from './results/SimulationProgress'
import {
  DigitalTwinExecutionModeSelector,
  DigitalTwinExecutionSessionActions,
} from './controls/DigitalTwinExecutionControls'
import { SIM_STATE } from './hooks/useSimulationExecution'

export function GlbSimulationPanel({ lab, model, resources, simulation, configuration, interactive, proxy }) {
  const { fmiVersion, simulationTypeLabel, fmiLsStruct } = model
  const { modelVariables, structModelVariables = modelVariables, editableVariables, runtimeVariables } = resources
  const {
    parameters,
    onParameterChange,
    options,
    onOptionChange,
    inputEvents,
    onInputEventsChange,
    onRun,
    fmuStateControls,
    ignoreScheduleEventsBeforeStartTime,
  } = simulation
  const { presets, experiments, selectedPresetId, selectedExperimentId, onPresetSelect, onExperimentSelect } = configuration
  const selectedExperiment = experiments.find((experiment) => experiment.id === selectedExperimentId) || null
  const {
    executionMode,
    onExecutionModeChange,
    continuousBatchPolicy,
    onContinuousBatchPolicyChange,
    continuousExecutionPace,
    onContinuousExecutionPaceChange,
    fixedBatchSamples,
    onFixedBatchSamplesChange,
    supportedModes,
    execution,
    state,
    progress,
    errorMessage,
  } = interactive

  return (
    <>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#67d7cf]">Interactive digital twin</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-white sm:text-4xl">{lab?.name || 'Digital Twin'}</h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-300">Run the FMU simulation to animate the linked GLB scene.</p>
        </div>
        <div className="rounded-xl border border-[#315057] bg-[#122328] px-4 py-3 text-xs text-[#b8d2d5]">
          <span className="mr-2 inline-block h-2 w-2 rounded-full bg-emerald-400" />
          FMI {fmiVersion || '?'} · {simulationTypeLabel || 'FMU'}
        </div>
      </div>

      <FmiLsStructMapPanel fmiLsStruct={fmiLsStruct} modelVariables={structModelVariables} values={parameters} outputs={simulation.results?.outputs} />

      {editableVariables.length === 0 && (
        <p className="rounded-xl border border-[#26383f] bg-[#142128] p-3 text-xs text-[#9aafb4]">This model has no editable input variables or parameters. Run it with its declared defaults.</p>
      )}

      <DigitalTwinSimulationForm
        variables={editableVariables}
        modelVariables={modelVariables}
        fmiLsStruct={fmiLsStruct}
        scheduleVariables={runtimeVariables}
        values={parameters}
        onInputChange={onParameterChange}
        simulationOptions={options}
        onSimulationOptionChange={onOptionChange}
        simulationType={simulation.simulationType}
        configurationSelector={(
          <>
            <FmiLsResourceSelect
              options={presets}
              selectedOptionId={selectedPresetId}
              onSelect={onPresetSelect}
              disabled={state === SIM_STATE.RUNNING || execution.hasActiveSession}
              fitContent
            />
            <FmiLsResourceSelect
              options={experiments}
              selectedOptionId={selectedExperimentId}
              onSelect={onExperimentSelect}
              choiceLabel="Experiment"
              disabled={state === SIM_STATE.RUNNING || execution.hasActiveSession}
              fitContent
            />
          </>
        )}
        selectedExperiment={selectedExperiment}
        fmuStateControls={fmuStateControls}
        executionMode={executionMode}
        executionModeControl={supportedModes ? (
          <DigitalTwinExecutionModeSelector
            executionMode={executionMode}
            onExecutionModeChange={onExecutionModeChange}
            executionModes={['continuous', 'batch', 'step']}
            batchPolicy={continuousBatchPolicy}
            onBatchPolicyChange={onContinuousBatchPolicyChange}
            executionPace={continuousExecutionPace}
            onExecutionPaceChange={onContinuousExecutionPaceChange}
            fixedBatchSamples={fixedBatchSamples}
            onFixedBatchSamplesChange={onFixedBatchSamplesChange}
            running={state === SIM_STATE.RUNNING}
            status={execution.status}
          />
        ) : null}
        executionSessionControls={supportedModes ? (
          <DigitalTwinExecutionSessionActions
            status={execution.status}
            mode={execution.mode}
            simulationTime={execution.simulationTime}
            onAdvanceStep={() => void execution.advanceStep()}
            onToggleContinuous={() => execution.status === 'continuous'
              ? execution.pauseContinuous()
              : void execution.startContinuous()}
            onEnd={execution.end}
            onCancel={execution.end}
            runtimeVariables={runtimeVariables}
            modelVariables={modelVariables}
            fmiLsStruct={fmiLsStruct}
            values={execution.liveParameters}
            runtimeInputEditing={execution.runtimeInputEditing}
            onInputChange={execution.handleInputChange}
          />
        ) : null}
        stickyToolbar
        stickyToolbarOffset={80}
        enableInputSchedule={simulation.enableInputSchedule && executionMode === 'batch'}
        ignoreScheduleEventsBeforeStartTime={ignoreScheduleEventsBeforeStartTime}
        inputEvents={inputEvents}
        onInputEventsChange={onInputEventsChange}
        running={state === SIM_STATE.RUNNING}
        showRunButton={!execution.hasActiveSession || executionMode === 'batch'}
        onRun={onRun}
      />

      {proxy.visible && proxy.state !== 'idle' && (
        <p role={proxy.state === 'error' ? 'alert' : 'status'} className={`mb-4 text-xs ${proxy.state === 'error' ? 'text-error-text' : 'text-[#9aafb4]'}`}>
          {proxy.state === 'running' ? 'Preparing the reservation FMU…' : proxy.message}
        </p>
      )}
      {state === SIM_STATE.RUNNING && executionMode === 'batch' && (
        <div className="mt-3"><SimulationProgress elapsedSeconds={progress.elapsedSeconds} chunkIndex={progress.chunkIndex} totalChunks={progress.totalChunks} /></div>
      )}
      {state === SIM_STATE.ERROR && errorMessage && <p role="alert" className="mt-3 rounded-lg border border-error-border bg-error-bg p-3 text-sm text-error-text">{errorMessage}</p>}
    </>
  )
}
