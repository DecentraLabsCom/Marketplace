'use client'

import { useState } from 'react'
import PropTypes from 'prop-types'
import Modal from '@/components/ui/Modal'
import { resolveInputSchedule } from '../utils/simulationParameters'
import { DigitalTwinContinuousMetrics } from './DigitalTwinExecutionControls'
import DigitalTwinInputGrid from './DigitalTwinInputGrid'
import InputScheduleDialog from './InputScheduleDialog'
import SimulationOptions from './SimulationOptions'
import { getSimulationOptionsError } from '../utils/simulationTime'
import { canScheduleFmiLsInputChanges } from '@/utils/fmiLsEligibility'

export default function DigitalTwinSimulationForm({
  variables,
  modelVariables,
  fmiLsStruct,
  values,
  onInputChange,
  simulationOptions,
  onSimulationOptionChange,
  simulationType,
  executionMode = 'batch',
  executionModeControl = null,
  fmuStateControls = null,
  configurationSelector = null,
  selectedExperiment = null,
  executionSessionControls = null,
  continuousMetrics = null,
  stickyToolbar = false,
  stickyToolbarOffset = 0,
  enableInputSchedule = true,
  scheduleVariables,
  inputEvents = [],
  onInputEventsChange = () => {},
  ignoreScheduleEventsBeforeStartTime = false,
  showRunButton = true,
  running = false,
  onRun,
}) {
  const [activeDialog, setActiveDialog] = useState(null)
  const includeStepSize = simulationType !== 'ScheduledExecution'
  const availableScheduleVariables = Array.isArray(scheduleVariables)
    ? scheduleVariables
    : variables.filter((variable) => variable?.causality === 'input')
  const canScheduleInputChanges = canScheduleFmiLsInputChanges(
    enableInputSchedule,
    availableScheduleVariables,
    executionMode,
  )
  const inputVariables = variables.filter((variable) => variable?.causality === 'input')
  const tunableParameterVariables = variables.filter((variable) => variable?.causality === 'parameter')
  const simulationOptionsError = getSimulationOptionsError(simulationOptions, { includeStepSize })
  let inputScheduleError = ''
  try {
    resolveInputSchedule({
      experiment: selectedExperiment,
      inputEvents,
      scheduleVariables: availableScheduleVariables,
      modelVariables,
      options: simulationOptions,
      ignoreEventsBeforeStartTime: ignoreScheduleEventsBeforeStartTime,
      enabled: canScheduleInputChanges && !simulationOptionsError,
    })
  } catch (error) {
    inputScheduleError = error.message
  }
  const toolbarClassName = [
    'mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#263a42] bg-[#101a20] p-3 sm:p-4',
    stickyToolbar ? 'sticky z-40 shadow-lg' : '',
  ].filter(Boolean).join(' ')

  function handleRun() {
    if (simulationOptionsError) {
      setActiveDialog('run-controls')
      return
    }
    if (executionMode === 'batch' && inputScheduleError) {
      setActiveDialog('schedule')
      return
    }
    setActiveDialog(null)
    onRun(inputEvents)
  }

  return (
    <>
      <section
        className={toolbarClassName}
        style={stickyToolbar ? { top: `${stickyToolbarOffset}px` } : undefined}
        aria-label="Simulation controls"
      >
        <div className="flex flex-wrap items-center gap-2">
          {fmuStateControls}
          {configurationSelector}
          {executionModeControl}
          <button
            type="button"
            aria-haspopup="dialog"
            onClick={() => setActiveDialog('run-controls')}
            disabled={running}
            className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-[#30464d] bg-[#142128] px-3 text-xs font-semibold text-[#dce9e9] transition hover:border-[#54d5c9] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#54d5c9] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <span>Run Controls</span>
            <span className="rounded-full bg-[#20363d] px-2 py-0.5 font-mono text-[10px] text-[#9ab8bd]">{variables.length}</span>
          </button>
          {canScheduleInputChanges ? (
            <button
              type="button"
              aria-haspopup="dialog"
              onClick={() => setActiveDialog('schedule')}
              disabled={running}
              className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-[#30464d] bg-[#142128] px-3 text-xs font-semibold text-[#dce9e9] transition hover:border-[#54d5c9] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#54d5c9] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <span>Schedule changes</span>
              <span className="rounded-full bg-[#20363d] px-2 py-0.5 font-mono text-[10px] text-[#9ab8bd]">{inputEvents.length}</span>
            </button>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {executionSessionControls}
          {showRunButton ? (
            <button
              type="button"
              onClick={handleRun}
              disabled={running}
              className="min-h-10 rounded-xl bg-[#20b7aa] px-5 py-2.5 text-sm font-bold text-[#061416] transition hover:bg-[#49d7c8] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {running ? 'Running...' : 'Run model'}
            </button>
          ) : null}
        </div>
        {!activeDialog && executionMode === 'batch' && inputScheduleError ? (
          <p role="alert" className="w-full text-xs text-[#ffb5bd]">
            {inputScheduleError}
          </p>
        ) : null}
      </section>

      {executionMode === 'continuous' && continuousMetrics ? (
        <div className="-mt-3 mb-4">
          <DigitalTwinContinuousMetrics metrics={continuousMetrics} />
        </div>
      ) : null}

      <Modal
        isOpen={activeDialog === 'run-controls'}
        onClose={() => setActiveDialog(null)}
        title="Run Controls"
        titleAside="Set model inputs and simulation time for the next run"
        size="3xl"
        theme="dark"
        className="bg-[#101a20]! border border-[#263a42]"
        portal
      >
        <section className="mb-4 grid gap-3" aria-label="Inputs and tunable parameters">
          {variables.length === 0 ? (
            <p className="rounded-lg border border-[#26383f] bg-[#0c171c] px-3 py-2 text-xs text-[#829ba1]">
              This FMU has no editable input variables or parameters.
            </p>
          ) : (
            <div className="max-h-[min(55vh,17.5rem)] overflow-y-auto overscroll-contain pr-2">
              <div className="grid gap-4">
                {inputVariables.length > 0 ? (
                  <section aria-labelledby="digital-twin-run-inputs-title">
                    <h3 id="digital-twin-run-inputs-title" className="mb-2 text-sm font-semibold text-white">Inputs</h3>
                    <DigitalTwinInputGrid
                      variables={inputVariables}
                      modelVariables={modelVariables}
                      fmiLsStruct={fmiLsStruct}
                      values={values}
                      onChange={onInputChange}
                      disabled={running}
                    />
                  </section>
                ) : null}
                {tunableParameterVariables.length > 0 ? (
                  <section aria-labelledby="digital-twin-run-parameters-title">
                    <h3 id="digital-twin-run-parameters-title" className="mb-2 text-sm font-semibold text-white">Tunable parameters</h3>
                    <DigitalTwinInputGrid
                      variables={tunableParameterVariables}
                      modelVariables={modelVariables}
                      fmiLsStruct={fmiLsStruct}
                      values={values}
                      onChange={onInputChange}
                      disabled={running}
                    />
                  </section>
                ) : null}
              </div>
            </div>
          )}
        </section>
        <SimulationOptions
          options={simulationOptions}
          onChange={onSimulationOptionChange}
          simulationType={simulationType}
          disabled={running}
          readOnlyStartTime
        />
      </Modal>

      {canScheduleInputChanges ? (
        <InputScheduleDialog
          isOpen={activeDialog === 'schedule'}
          onClose={() => setActiveDialog(null)}
          variables={availableScheduleVariables}
          modelVariables={modelVariables}
          initialValues={values}
          events={inputEvents}
          startTime={Number(simulationOptions.startTime)}
          stopTime={Number(simulationOptions.stopTime)}
          stepSize={Number(simulationOptions.stepSize)}
          validationError={inputScheduleError}
          disabled={running}
          onChange={onInputEventsChange}
        />
      ) : null}
    </>
  )
}

DigitalTwinSimulationForm.propTypes = {
  variables: PropTypes.arrayOf(PropTypes.object).isRequired,
  modelVariables: PropTypes.arrayOf(PropTypes.object).isRequired,
  fmiLsStruct: PropTypes.object,
  values: PropTypes.object.isRequired,
  onInputChange: PropTypes.func.isRequired,
  simulationOptions: PropTypes.shape({
    startTime: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
    stopTime: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
    stepSize: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
  }).isRequired,
  onSimulationOptionChange: PropTypes.func.isRequired,
  simulationType: PropTypes.string,
  executionMode: PropTypes.oneOf(['batch', 'step', 'continuous']),
  executionModeControl: PropTypes.node,
  fmuStateControls: PropTypes.node,
  configurationSelector: PropTypes.node,
  selectedExperiment: PropTypes.object,
  executionSessionControls: PropTypes.node,
  continuousMetrics: PropTypes.object,
  stickyToolbar: PropTypes.bool,
  stickyToolbarOffset: PropTypes.number,
  enableInputSchedule: PropTypes.bool,
  scheduleVariables: PropTypes.arrayOf(PropTypes.object),
  inputEvents: PropTypes.arrayOf(PropTypes.object),
  onInputEventsChange: PropTypes.func,
  ignoreScheduleEventsBeforeStartTime: PropTypes.bool,
  showRunButton: PropTypes.bool,
  running: PropTypes.bool,
  onRun: PropTypes.func.isRequired,
}
