'use client'

import { useState } from 'react'
import PropTypes from 'prop-types'
import Modal from '@/components/ui/Modal'
import { normalizeInputSchedule } from './simulationParameters'
import { DigitalTwinContinuousMetrics } from './DigitalTwinExecutionControls'
import DigitalTwinInputGrid from './DigitalTwinInputGrid'
import InputScheduleEditor from './InputScheduleEditor'
import SimulationOptions from './SimulationOptions'
import { getSimulationOptionsError } from './simulationTime'

export default function DigitalTwinSimulationForm({
  variables,
  modelVariables,
  values,
  onInputChange,
  simulationOptions,
  onSimulationOptionChange,
  simulationType,
  executionMode = 'batch',
  executionModeControl = null,
  configurationSelector = null,
  executionSessionControls = null,
  continuousMetrics = null,
  stickyToolbar = false,
  stickyToolbarOffset = 0,
  enableInputSchedule = true,
  scheduleVariables,
  inputEvents = [],
  onInputEventsChange = () => {},
  showRunButton = true,
  running = false,
  onRun,
}) {
  const [activeDialog, setActiveDialog] = useState(null)
  const includeStepSize = simulationType !== 'ScheduledExecution'
  const availableScheduleVariables = Array.isArray(scheduleVariables)
    ? scheduleVariables
    : variables.filter((variable) => variable?.causality === 'input')
  const canScheduleInputChanges = enableInputSchedule && executionMode === 'batch' && availableScheduleVariables.length > 0
  const simulationOptionsError = getSimulationOptionsError(simulationOptions, { includeStepSize })
  let inputScheduleError = ''
  if (canScheduleInputChanges && !simulationOptionsError) {
    try {
      normalizeInputSchedule(
        inputEvents,
        availableScheduleVariables,
        modelVariables,
        Number(simulationOptions.startTime),
        Number(simulationOptions.stopTime),
        Number(simulationOptions.stepSize),
      )
    } catch (error) {
      inputScheduleError = error.message
    }
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
        {!activeDialog && (simulationOptionsError || (executionMode === 'batch' && inputScheduleError)) ? (
          <p role="alert" className="w-full text-xs text-[#ffb5bd]">
            {simulationOptionsError || (executionMode === 'batch' ? inputScheduleError : '')}
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
        <section className="mb-4 grid gap-3" aria-labelledby="digital-twin-run-inputs-title">
          <h3 id="digital-twin-run-inputs-title" className="text-sm font-semibold text-white">Inputs and tunable parameters</h3>
          <DigitalTwinInputGrid
            variables={variables}
            modelVariables={modelVariables}
            values={values}
            onChange={onInputChange}
            disabled={running}
            emptyMessage="This FMU has no editable input variables or parameters."
            maxVisibleRows={3}
          />
        </section>
        <SimulationOptions
          options={simulationOptions}
          onChange={onSimulationOptionChange}
          simulationType={simulationType}
          disabled={running}
        />
        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={() => setActiveDialog(null)}
            className="min-h-10 rounded-lg border border-[#30464d] px-4 text-xs font-semibold text-[#dce9e9] transition hover:border-[#54d5c9] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#54d5c9]"
          >
            Done
          </button>
        </div>
      </Modal>

      {canScheduleInputChanges ? (
        <Modal
          isOpen={activeDialog === 'schedule'}
          onClose={() => setActiveDialog(null)}
          title="Schedule variable changes"
          size="2xl"
          theme="dark"
          className="bg-[#101a20]! border border-[#263a42]"
          portal
        >
          <InputScheduleEditor
            variables={availableScheduleVariables}
            modelVariables={modelVariables}
            initialValues={values}
            events={inputEvents}
            startTime={Number(simulationOptions.startTime)}
            stopTime={Number(simulationOptions.stopTime)}
            stepSize={Number(simulationOptions.stepSize)}
            validationError={inputScheduleError}
            disabled={running}
            tooltipPortal
            onChange={onInputEventsChange}
          />
          <div className="mt-4 flex justify-end">
            <button
              type="button"
              onClick={() => setActiveDialog(null)}
              className="min-h-10 rounded-lg border border-[#30464d] px-4 text-xs font-semibold text-[#dce9e9] transition hover:border-[#54d5c9] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#54d5c9]"
            >
              Done
            </button>
          </div>
        </Modal>
      ) : null}
    </>
  )
}

DigitalTwinSimulationForm.propTypes = {
  variables: PropTypes.arrayOf(PropTypes.object).isRequired,
  modelVariables: PropTypes.arrayOf(PropTypes.object).isRequired,
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
  configurationSelector: PropTypes.node,
  executionSessionControls: PropTypes.node,
  continuousMetrics: PropTypes.object,
  stickyToolbar: PropTypes.bool,
  stickyToolbarOffset: PropTypes.number,
  enableInputSchedule: PropTypes.bool,
  scheduleVariables: PropTypes.arrayOf(PropTypes.object),
  inputEvents: PropTypes.arrayOf(PropTypes.object),
  onInputEventsChange: PropTypes.func,
  showRunButton: PropTypes.bool,
  running: PropTypes.bool,
  onRun: PropTypes.func.isRequired,
}
