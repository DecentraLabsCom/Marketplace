import FmiLsStructMapPanel from './digital-twin/FmiLsStructMapPanel'
import FmiLsResourceSelect from './controls/FmiLsResourceSelect'
import DigitalTwinSimulationForm from './controls/DigitalTwinSimulationForm'
import InputScheduleEditor from './controls/InputScheduleEditor'
import SimulationOptions from './controls/SimulationOptions'
import SimulationProgress from './results/SimulationProgress'
import ResultsChart from './results/ResultsChart'
import ResultsTable from './results/ResultsTable'
import DownloadButtons from './results/DownloadButtons'
import SimulationHistory from './results/SimulationHistory'
import ParameterForm from './controls/ParameterForm'
import {
  DigitalTwinExecutionModeSelector,
  DigitalTwinExecutionSessionActions,
} from './controls/DigitalTwinExecutionControls'
import { SIM_STATE } from './hooks/useSimulationExecution'

export function GlbSimulationPanel({ lab, model, resources, simulation, configuration, interactive, proxy }) {
  const { fmiVersion, simulationTypeLabel, fmiLsStruct } = model
  const { modelVariables, structModelVariables = modelVariables, editableVariables, runtimeVariables } = resources
  const { parameters, onParameterChange, options, onOptionChange, inputEvents, onInputEventsChange, onRun } = simulation
  const { presets, experiments, selectedPresetId, selectedExperimentId, onPresetSelect, onExperimentSelect } = configuration
  const selectedExperiment = experiments.find((experiment) => experiment.id === selectedExperimentId) || null
  const {
    executionMode,
    onExecutionModeChange,
    continuousBatchPolicy,
    onContinuousBatchPolicyChange,
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
            />
            <FmiLsResourceSelect
              options={experiments}
              selectedOptionId={selectedExperimentId}
              onSelect={onExperimentSelect}
              choiceLabel="Experiment"
              disabled={state === SIM_STATE.RUNNING || execution.hasActiveSession}
            />
          </>
        )}
        selectedExperiment={selectedExperiment}
        executionMode={executionMode}
        continuousMetrics={execution.mode === 'continuous' && execution.hasActiveSession ? execution.batchMetrics : null}
        executionModeControl={supportedModes ? (
          <DigitalTwinExecutionModeSelector
            executionMode={executionMode}
            onExecutionModeChange={onExecutionModeChange}
            executionModes={['batch', 'step', 'continuous']}
            batchPolicy={continuousBatchPolicy}
            onBatchPolicyChange={onContinuousBatchPolicyChange}
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

export function GenericFmuSimulationPanel({ lab, fmuMeta, simulationTypeLabel, model, resources, simulation, configuration, history, proxy }) {
  const { fmiLsStruct } = model
  const { modelVariables, editableVariables, runtimeVariables } = resources
  const { state, results, errorMessage, progress, parameters, onParameterChange, options, onOptionChange, inputEvents, onInputEventsChange, onRun, solver, onSolverChange, optionsError, scheduleError, supportsInputSchedule } = simulation
  const { presets, experiments, selectedPresetId, selectedExperimentId, onPresetSelect, onExperimentSelect } = configuration

  return (
    <>
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-header-bg">Simulation: {lab?.name || 'Untitled FMU'}</h2>
          <p className="mt-1 text-sm text-text-secondary">{fmuMeta.fmuFileName} &middot; FMI {fmuMeta.fmiVersion || '?'} &middot; {simulationTypeLabel || '?'}</p>
        </div>
        <button onClick={history.onToggle} className="text-xs text-brand hover:underline">
          {history.visible ? 'Hide History' : 'Show History'}
        </button>
      </div>

      <FmiLsStructMapPanel fmiLsStruct={fmiLsStruct} modelVariables={modelVariables} values={parameters} outputs={results?.outputs} />

      {proxy.visible && proxy.state !== 'idle' && (
        <p role={proxy.state === 'error' ? 'alert' : 'status'} className={`rounded-lg border p-3 text-xs ${proxy.state === 'error' ? 'border-error-border bg-error-bg text-error-text' : 'border-[#2a2f33] bg-[#1f2426] text-text-secondary'}`}>
          {proxy.state === 'running' ? 'Preparing the reservation FMU…' : proxy.message}
        </p>
      )}

      {history.visible && (
        <SimulationHistory
          labId={String(lab.id ?? lab.tokenId ?? '')}
          reservationKey={history.reservationKey}
          gatewayUrl={history.gatewayUrl}
          gatewaySessionOrigin={history.gatewaySessionOrigin}
          onEnsureGatewaySession={history.onEnsureGatewaySession}
          onFetchGateway={history.onFetchGateway}
          onLoadResult={history.onLoadResult}
        />
      )}

      {editableVariables.length > 0 && (
        <FmiLsResourceSelect options={presets} selectedOptionId={selectedPresetId} onSelect={onPresetSelect} disabled={state === SIM_STATE.RUNNING} />
      )}
      {experiments.length > 0 && (
        <FmiLsResourceSelect options={experiments} selectedOptionId={selectedExperimentId} onSelect={onExperimentSelect} choiceLabel="Experiment" disabled={state === SIM_STATE.RUNNING} />
      )}
      {editableVariables.length > 0 && (
        <ParameterForm
          variables={editableVariables}
          modelVariables={modelVariables}
          fmiLsStruct={fmiLsStruct}
          values={parameters}
          onChange={onParameterChange}
          disabled={state === SIM_STATE.RUNNING}
        />
      )}
      {supportsInputSchedule && runtimeVariables.length > 0 && (
        <InputScheduleEditor
          variables={runtimeVariables}
          modelVariables={modelVariables}
          initialValues={parameters}
          events={inputEvents}
          startTime={Number(options.startTime)}
          stopTime={Number(options.stopTime)}
          stepSize={Number(options.stepSize)}
          validationError={scheduleError}
          disabled={state === SIM_STATE.RUNNING}
          onChange={onInputEventsChange}
        />
      )}

      <SimulationOptions options={options} onChange={onOptionChange} simulationType={fmuMeta.simulationType} disabled={state === SIM_STATE.RUNNING} />
      {fmuMeta.simulationType === 'ModelExchange' && (
        <div className="flex items-center gap-3">
          <label htmlFor="solver-select" className="text-xs text-text-secondary">ODE Solver:</label>
          <select
            id="solver-select"
            value={solver}
            onChange={(event) => onSolverChange(event.target.value)}
            disabled={state === SIM_STATE.RUNNING}
            className="bg-[#1f2426] border border-[#2a2f33] rounded px-2 py-1 text-neutral-200 text-sm focus:outline-none focus:border-brand disabled:opacity-50"
          >
            <option value="Euler">Euler (fast, less accurate)</option>
            <option value="CVode">CVode (adaptive, more accurate)</option>
          </select>
        </div>
      )}

      <div className="flex items-center gap-4">
        <button
          onClick={onRun}
          disabled={state === SIM_STATE.RUNNING || Boolean(scheduleError) || Boolean(optionsError)}
          className={`rounded px-6 py-2 font-medium transition-colors ${state === SIM_STATE.RUNNING || scheduleError || optionsError ? 'cursor-not-allowed bg-gray-600 text-gray-400' : 'bg-brand text-white hover:bg-hover-dark'}`}
        >
          {state === SIM_STATE.RUNNING ? 'Running…' : state === SIM_STATE.COMPLETED ? 'Re-run Simulation' : 'Run Simulation'}
        </button>
      </div>

      {state === SIM_STATE.RUNNING && <SimulationProgress elapsedSeconds={progress.elapsedSeconds} chunkIndex={progress.chunkIndex} totalChunks={progress.totalChunks} />}
      {state === SIM_STATE.ERROR && errorMessage && (
        <div className="rounded-lg border border-error-border bg-error-bg p-4">
          <p className="text-sm font-medium text-error-text">Simulation Error</p>
          <p className="mt-1 text-sm text-error-text">{errorMessage}</p>
        </div>
      )}

      {(state === SIM_STATE.COMPLETED || (state === SIM_STATE.RUNNING && results)) && results && (
        <div className="space-y-6">
          <h3 className="text-lg font-semibold text-header-bg">
            Results
            {results.fmiType && <span className="ml-2 text-xs font-normal text-text-secondary">({results.fmiType})</span>}
          </h3>
          {results.outputs && Object.keys(results.outputs).length > 0 && <ResultsChart outputs={results.outputs} time={results.time} variableMetadata={modelVariables} />}
          {state === SIM_STATE.COMPLETED && results.outputs && <ResultsTable outputs={results.outputs} time={results.time} variableMetadata={modelVariables} />}
          {state === SIM_STATE.COMPLETED && <DownloadButtons results={results} labName={lab?.name} variableMetadata={modelVariables} />}
        </div>
      )}
    </>
  )
}
