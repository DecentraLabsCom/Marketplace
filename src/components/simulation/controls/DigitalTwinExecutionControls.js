'use client'

import PropTypes from 'prop-types'
import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { MAX_SAMPLES_PER_BATCH } from '@decentralabs/digital-twin-app-protocol'
import Modal from '@/components/ui/Modal'
import DigitalTwinInputGrid from './DigitalTwinInputGrid'
import VariableDescriptionTooltip from './VariableDescriptionTooltip'

function formatPayloadBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return 'unknown size'
  return bytes < 1024 ? `${Math.round(bytes)} B` : `${(bytes / 1024).toFixed(1)} KB`
}

const EXECUTION_MODE_HELP = {
  batch: {
    name: 'Batch mode',
    description: 'Runs the full simulation automatically and returns the complete result.',
  },
  step: {
    name: 'Step-by-step mode',
    description: 'Advance one model step at a time and change inputs between steps.',
  },
  continuous: {
    name: 'Continuous mode',
    description: 'Advances automatically in batches while allowing live input changes.',
  },
}

export function DigitalTwinExecutionModeSelector({
  executionMode,
  onExecutionModeChange,
  executionModes,
  batchPolicy = 'adaptive',
  onBatchPolicyChange = () => {},
  fixedBatchSamples = MAX_SAMPLES_PER_BATCH,
  onFixedBatchSamplesChange = () => {},
  running,
  status,
}) {
  const hasInteractiveSession = ['connecting', 'paused', 'stepping', 'continuous', 'pausing', 'stopping'].includes(status)
  const controlsDisabled = running || hasInteractiveSession
  const executionModeHelp = EXECUTION_MODE_HELP[executionMode]

  if (executionModes.length <= 1) return null

  return (
    <div className="flex flex-wrap items-end gap-2">
      <div className="flex min-h-10 items-center gap-2 rounded-lg border border-[#30464d] bg-[#142128] px-3 text-xs text-[#a9bec2] transition focus-within:border-[#54d5c9] focus-within:ring-2 focus-within:ring-[#54d5c9]/30">
        <VariableDescriptionTooltip
          name={executionModeHelp.name}
          description={executionModeHelp.description}
        >
          <label htmlFor="execution-mode" className="cursor-help">Execution mode</label>
        </VariableDescriptionTooltip>
        <span className="relative inline-flex min-h-8 items-center">
          <select
            id="execution-mode"
            aria-label="Execution mode"
            value={executionMode}
            onChange={(event) => onExecutionModeChange(event.target.value)}
            disabled={controlsDisabled}
            style={{
              colorScheme: 'dark',
              appearance: 'none',
              WebkitAppearance: 'none',
              MozAppearance: 'none',
              backgroundImage: 'none',
            }}
            className="h-8 w-max min-w-0 appearance-none border-0 bg-transparent py-0 pl-1 pr-6 text-xs font-semibold text-[#f1f7f8] shadow-none outline-none ring-0 focus:border-transparent focus:outline-none focus:ring-0 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <option title={EXECUTION_MODE_HELP.batch.description} value="batch" className="bg-[#101a20] text-sm font-medium text-[#f1f7f8] hover:bg-[#20b7aa] hover:text-[#061416] focus:bg-[#20b7aa] focus:text-[#061416]">Batch</option>
            <option title={EXECUTION_MODE_HELP.step.description} value="step" className="bg-[#101a20] text-sm font-medium text-[#f1f7f8] hover:bg-[#20b7aa] hover:text-[#061416] focus:bg-[#20b7aa] focus:text-[#061416]">Step by step</option>
            <option title={EXECUTION_MODE_HELP.continuous.description} value="continuous" className="bg-[#101a20] text-sm font-medium text-[#f1f7f8] hover:bg-[#20b7aa] hover:text-[#061416] focus:bg-[#20b7aa] focus:text-[#061416]">Continuous</option>
          </select>
          <ChevronDown size={14} aria-hidden="true" className="pointer-events-none absolute right-1 text-[#9ab8bd]" />
        </span>
      </div>
      {executionMode === 'continuous' && executionModes.includes('continuous') ? (
        <>
          <div className="flex min-h-10 items-center gap-2 rounded-lg border border-[#30464d] bg-[#142128] px-3 text-xs text-[#a9bec2] transition focus-within:border-[#54d5c9] focus-within:ring-2 focus-within:ring-[#54d5c9]/30">
            <VariableDescriptionTooltip
              name={batchPolicy === 'adaptive' ? 'Adaptive batches' : 'Fixed batches'}
              description={batchPolicy === 'adaptive'
                ? 'Adjusts batch size to measured runtime and display performance.'
                : 'Uses your selected sample cap for each request.'}
            >
              <label htmlFor="continuous-batch-strategy" className="cursor-help">Batch strategy</label>
            </VariableDescriptionTooltip>
            <span className="relative inline-flex min-h-8 items-center">
              <select
                id="continuous-batch-strategy"
                aria-label="Continuous batch strategy"
                value={batchPolicy}
                onChange={(event) => onBatchPolicyChange(event.target.value)}
                disabled={controlsDisabled}
                style={{
                  colorScheme: 'dark',
                  appearance: 'none',
                  WebkitAppearance: 'none',
                  MozAppearance: 'none',
                  backgroundImage: 'none',
                }}
                className="h-8 w-max min-w-0 appearance-none border-0 bg-transparent py-0 pl-1 pr-6 text-xs font-semibold text-[#f1f7f8] shadow-none outline-none ring-0 focus:border-transparent focus:outline-none focus:ring-0 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <option value="adaptive" className="bg-[#101a20] text-sm font-medium text-[#f1f7f8]">Adaptive</option>
                <option value="fixed" className="bg-[#101a20] text-sm font-medium text-[#f1f7f8]">Fixed sample cap</option>
              </select>
              <ChevronDown size={14} aria-hidden="true" className="pointer-events-none absolute right-1 text-[#9ab8bd]" />
            </span>
          </div>
          {batchPolicy === 'fixed' ? (
            <div className="flex min-h-10 items-center gap-2 rounded-lg border border-[#30464d] bg-[#142128] px-3 text-xs text-[#a9bec2] transition focus-within:border-[#54d5c9] focus-within:ring-2 focus-within:ring-[#54d5c9]/30">
              <label htmlFor="maximum-fixed-batch-samples">Max samples</label>
              <VariableDescriptionTooltip
                name="Fixed batch size"
                description={`Caps each request at this many samples (up to ${MAX_SAMPLES_PER_BATCH}). The Executor may stop earlier at its compute limit or an FMU event.`}
              >
                <input
                  id="maximum-fixed-batch-samples"
                  aria-label="Maximum samples per fixed batch"
                  type="number"
                  min="1"
                  max={MAX_SAMPLES_PER_BATCH}
                  step="1"
                  value={fixedBatchSamples}
                  onChange={(event) => {
                    const value = Number(event.target.value)
                    if (Number.isInteger(value) && value >= 1 && value <= MAX_SAMPLES_PER_BATCH) {
                      onFixedBatchSamplesChange(value)
                    }
                  }}
                  disabled={controlsDisabled}
                  className="h-8 w-[3.75rem] rounded-md border border-[#30464d] bg-[#101a20] px-2 text-xs font-semibold text-[#f1f7f8] outline-none focus:border-[#54d5c9] disabled:cursor-not-allowed disabled:opacity-50"
                />
              </VariableDescriptionTooltip>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  )
}

export function DigitalTwinContinuousMetrics({ metrics }) {
  if (!metrics) return null

  return (
    <p className="mt-1 text-center text-[11px] leading-relaxed text-[#8da9ae]" title={metrics.policy === 'fixed'
      ? 'The request uses a fixed sample cap and the Executor compute budget. The model step size stays fixed.'
      : 'Batch size uses measured Executor compute, full request-cycle time, payload size and confirmed presentation latency. The model step size stays fixed.'}>
      {metrics.policy === 'fixed' ? `Fixed cap ${metrics.nextBatchSamples} · ` : 'Adaptive · '}{metrics.samples} samples · {formatPayloadBytes(metrics.sampleBytes)} · cycle {Math.round(metrics.responseMs)} ms · Executor {Number.isFinite(metrics.computeMs) ? `${Math.round(metrics.computeMs)} ms` : 'measuring'} · display {metrics.presentationConfirmed ? `${Math.round(metrics.renderDelayMs ?? 0)} ms` : 'unconfirmed'} · input-to-sample {Number.isFinite(metrics.interactionDelayEwmaMs) ? `${Math.round(metrics.interactionDelayEwmaMs)} ms` : 'not measured'}{metrics.policy === 'adaptive' ? ` · next ${metrics.nextBatchSamples} · ${metrics.targetReachable === false ? 'latency target unreachable' : metrics.batchConstraint}` : ''} · {metrics.stopReason.replaceAll('_', ' ')}{metrics.computeBudgetOverrunMs > 0 ? ` (+${Math.round(metrics.computeBudgetOverrunMs)} ms over budget)` : ''}
    </p>
  )
}

DigitalTwinContinuousMetrics.propTypes = {
  metrics: PropTypes.shape({
    samples: PropTypes.number,
    sampleBytes: PropTypes.number,
    policy: PropTypes.oneOf(['adaptive', 'fixed']),
    responseMs: PropTypes.number,
    computeMs: PropTypes.number,
    presentationConfirmed: PropTypes.bool,
    renderDelayMs: PropTypes.number,
    interactionDelayEwmaMs: PropTypes.number,
    nextBatchSamples: PropTypes.number,
    targetReachable: PropTypes.bool,
    batchConstraint: PropTypes.string,
    stopReason: PropTypes.string,
    computeBudgetOverrunMs: PropTypes.number,
  }),
}

export function DigitalTwinExecutionSessionActions({
  status,
  mode,
  simulationTime,
  onAdvanceStep,
  onToggleContinuous,
  onEnd,
  onCancel,
  runtimeVariables = [],
  modelVariables = [],
  fmiLsStruct,
  values = {},
  runtimeInputEditing = false,
  onInputChange = () => {},
}) {
  const [runtimeVariablesOpen, setRuntimeVariablesOpen] = useState(false)
  const hasInteractiveSession = ['connecting', 'paused', 'stepping', 'continuous', 'pausing', 'stopping'].includes(status)
  const canEditRuntimeVariables = (
    (mode === 'step' && ['paused', 'stepping'].includes(status))
    || (mode === 'continuous' && ['paused', 'continuous', 'pausing'].includes(status))
  ) && runtimeVariables.length > 0

  if (!hasInteractiveSession) return null

  return (
    <>
      {status === 'connecting' ? (
        <>
          <span role="status" className="text-xs text-[#b8d2d5]">Connecting to the provider runtime…</span>
          <button type="button" onClick={onCancel} className="min-h-10 rounded-lg border border-[#583c43] px-3 text-xs font-semibold text-[#ffc8ce] hover:bg-[#3a232a]">Cancel</button>
        </>
      ) : (
        <>
          <span role="status" className="text-xs text-[#b8d2d5]">
            {status === 'stepping' ? 'Advancing…' : status === 'pausing' ? 'Pausing…' : status === 'stopping' ? `Ending after the current ${mode === 'continuous' ? 'batch' : 'step'}…` : `t = ${simulationTime.toFixed(3)} s`}
          </span>
          {canEditRuntimeVariables ? (
            <button
              type="button"
              onClick={() => setRuntimeVariablesOpen(true)}
              disabled={!runtimeInputEditing}
              aria-label="Change variables"
              aria-haspopup="dialog"
              className="min-h-10 rounded-lg border border-[#30464d] bg-[#142128] px-3 text-xs font-semibold text-[#dce9e9] hover:border-[#54d5c9] hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              <span>Change variables</span>
              <span className="rounded-full bg-[#20363d] px-2 py-0.5 font-mono text-[10px] text-[#9ab8bd]">{runtimeVariables.length}</span>
            </button>
          ) : null}
          {mode === 'step' ? (
            <button
              type="button"
              onClick={onAdvanceStep}
              disabled={status !== 'paused'}
              className="min-h-10 rounded-lg bg-[#20b7aa] px-3 text-xs font-bold text-[#061416] hover:bg-[#49d7c8] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {status === 'stepping' ? 'Advancing…' : 'Advance one step'}
            </button>
          ) : (
            <button
              type="button"
              onClick={onToggleContinuous}
              disabled={status === 'pausing' || status === 'stopping'}
              className="min-h-10 rounded-lg bg-[#20b7aa] px-3 text-xs font-bold text-[#061416] hover:bg-[#49d7c8] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {status === 'continuous' ? 'Pause' : status === 'pausing' ? 'Pausing…' : 'Resume continuous'}
            </button>
          )}
          <button
            type="button"
            onClick={onEnd}
            disabled={status === 'stopping'}
            className="min-h-10 rounded-lg border border-[#583c43] px-3 text-xs font-semibold text-[#ffc8ce] hover:bg-[#3a232a] disabled:cursor-not-allowed disabled:opacity-50"
          >
            End session
          </button>
        </>
      )}
      <Modal
        isOpen={runtimeVariablesOpen}
        onClose={() => setRuntimeVariablesOpen(false)}
        title="Change variables"
        size="2xl"
        theme="dark"
        className="bg-[#101a20]! border border-[#263a42]"
        portal
      >
        <p className="mb-4 text-xs text-[#829ba1]">
          {mode === 'step'
            ? 'Set values to apply before the next simulation step.'
            : 'Values are sent before the next batch; editing them does not pause continuous execution.'}
        </p>
        <DigitalTwinInputGrid
          variables={runtimeVariables}
          modelVariables={modelVariables}
          fmiLsStruct={fmiLsStruct}
          values={values}
          onChange={onInputChange}
          disabled={!runtimeInputEditing}
        />
        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={() => setRuntimeVariablesOpen(false)}
            className="min-h-10 rounded-lg border border-[#30464d] px-4 text-xs font-semibold text-[#dce9e9] transition hover:border-[#54d5c9] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#54d5c9]"
          >
            Done
          </button>
        </div>
      </Modal>
    </>
  )
}

export default function DigitalTwinExecutionControls({
  executionMode,
  onExecutionModeChange,
  executionModes,
  batchPolicy,
  onBatchPolicyChange,
  fixedBatchSamples,
  onFixedBatchSamplesChange,
  running,
  status,
  mode,
  simulationTime,
  values,
  modelVariables,
  runtimeVariables,
  fmiLsStruct,
  runtimeInputEditing,
  onInputChange,
  onAdvanceStep,
  onToggleContinuous,
  onEnd,
  onCancel,
  showToolbar = true,
}) {
  return (
    <>
      {showToolbar ? (
        <section className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#263a42] bg-[#101a20] p-3 sm:p-4" aria-label="Digital twin execution">
          <div className="flex flex-wrap items-center gap-2">
            <DigitalTwinExecutionModeSelector
              executionMode={executionMode}
              onExecutionModeChange={onExecutionModeChange}
              executionModes={executionModes}
              batchPolicy={batchPolicy}
              onBatchPolicyChange={onBatchPolicyChange}
              fixedBatchSamples={fixedBatchSamples}
              onFixedBatchSamplesChange={onFixedBatchSamplesChange}
              running={running}
              status={status}
            />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <DigitalTwinExecutionSessionActions
              status={status}
              mode={mode}
              simulationTime={simulationTime}
              onAdvanceStep={onAdvanceStep}
              onToggleContinuous={onToggleContinuous}
              onEnd={onEnd}
              onCancel={onCancel}
              runtimeVariables={runtimeVariables}
              modelVariables={modelVariables}
              fmiLsStruct={fmiLsStruct}
              values={values}
              runtimeInputEditing={runtimeInputEditing}
              onInputChange={onInputChange}
            />
          </div>
        </section>
      ) : null}

    </>
  )
}

DigitalTwinExecutionModeSelector.propTypes = {
  executionMode: PropTypes.oneOf(['batch', 'step', 'continuous']).isRequired,
  onExecutionModeChange: PropTypes.func.isRequired,
  executionModes: PropTypes.arrayOf(PropTypes.oneOf(['batch', 'step', 'continuous'])).isRequired,
  batchPolicy: PropTypes.oneOf(['adaptive', 'fixed']),
  onBatchPolicyChange: PropTypes.func,
  fixedBatchSamples: PropTypes.number,
  onFixedBatchSamplesChange: PropTypes.func,
  running: PropTypes.bool.isRequired,
  status: PropTypes.string.isRequired,
}

DigitalTwinExecutionSessionActions.propTypes = {
  status: PropTypes.string.isRequired,
  mode: PropTypes.oneOf(['step', 'continuous']),
  simulationTime: PropTypes.number.isRequired,
  onAdvanceStep: PropTypes.func.isRequired,
  onToggleContinuous: PropTypes.func.isRequired,
  onEnd: PropTypes.func.isRequired,
  onCancel: PropTypes.func.isRequired,
  runtimeVariables: PropTypes.arrayOf(PropTypes.object),
  modelVariables: PropTypes.arrayOf(PropTypes.object),
  fmiLsStruct: PropTypes.object,
  values: PropTypes.object,
  runtimeInputEditing: PropTypes.bool,
  onInputChange: PropTypes.func,
}

DigitalTwinExecutionControls.propTypes = {
  executionMode: PropTypes.oneOf(['batch', 'step', 'continuous']).isRequired,
  onExecutionModeChange: PropTypes.func.isRequired,
  executionModes: PropTypes.arrayOf(PropTypes.oneOf(['batch', 'step', 'continuous'])).isRequired,
  batchPolicy: PropTypes.oneOf(['adaptive', 'fixed']),
  onBatchPolicyChange: PropTypes.func,
  fixedBatchSamples: PropTypes.number,
  onFixedBatchSamplesChange: PropTypes.func,
  running: PropTypes.bool.isRequired,
  status: PropTypes.string.isRequired,
  mode: PropTypes.oneOf(['step', 'continuous']),
  simulationTime: PropTypes.number.isRequired,
  values: PropTypes.object.isRequired,
  modelVariables: PropTypes.arrayOf(PropTypes.object).isRequired,
  runtimeVariables: PropTypes.arrayOf(PropTypes.object).isRequired,
  fmiLsStruct: PropTypes.object,
  runtimeInputEditing: PropTypes.bool.isRequired,
  onInputChange: PropTypes.func.isRequired,
  onAdvanceStep: PropTypes.func.isRequired,
  onToggleContinuous: PropTypes.func.isRequired,
  onEnd: PropTypes.func.isRequired,
  onCancel: PropTypes.func.isRequired,
  showToolbar: PropTypes.bool,
}
