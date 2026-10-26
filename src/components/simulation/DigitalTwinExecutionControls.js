'use client'

import PropTypes from 'prop-types'
import DigitalTwinInput from './DigitalTwinInput'

export default function DigitalTwinExecutionControls({
  executionMode,
  onExecutionModeChange,
  executionModes,
  running,
  status,
  mode,
  simulationTime,
  batchMetrics,
  values,
  modelVariables,
  runtimeVariables,
  runtimeInputEditing,
  onInputChange,
  onAdvanceStep,
  onToggleContinuous,
  onEnd,
  onCancel,
}) {
  const hasInteractiveSession = ['connecting', 'paused', 'stepping', 'continuous', 'pausing', 'stopping'].includes(status)

  return (
    <>
      <section className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#263a42] bg-[#101a20] p-3 sm:p-4" aria-label="Digital twin execution">
        <div className="flex flex-wrap items-center gap-2">
          {executionModes.length > 1 ? (
            <label className="flex min-h-10 items-center gap-2 rounded-lg border border-[#30464d] bg-[#142128] px-3 text-xs text-[#a9bec2]">
              <span>Execution mode</span>
              <select
                aria-label="Execution mode"
                value={executionMode}
                onChange={(event) => onExecutionModeChange(event.target.value)}
                disabled={running || hasInteractiveSession}
                className="max-w-40 bg-transparent font-semibold text-white focus:outline-none disabled:opacity-50"
              >
                <option value="batch">Batch</option>
                <option value="step">Step by step</option>
                <option value="continuous">Continuous (live)</option>
              </select>
            </label>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {status === 'connecting' ? (
            <>
              <span role="status" className="text-xs text-[#b8d2d5]">Connecting to the provider runtime…</span>
              <button type="button" onClick={onCancel} className="min-h-10 rounded-lg border border-[#583c43] px-3 text-xs font-semibold text-[#ffc8ce] hover:bg-[#3a232a]">Cancel</button>
            </>
          ) : null}
          {hasInteractiveSession && status !== 'connecting' ? (
            <>
              <span role="status" className="text-xs text-[#b8d2d5]">
                {status === 'stepping' ? 'Advancing…' : status === 'pausing' ? 'Pausing…' : status === 'stopping' ? `Ending after the current ${mode === 'continuous' ? 'batch' : 'step'}…` : `t = ${simulationTime.toFixed(3)} s`}
              </span>
              {mode === 'continuous' && batchMetrics ? (
                <span className="text-[10px] text-[#8da9ae]" title="FMU response time and the delay before the rendered frame are smoothed to adjust the next batch size.">
                  Last batch {batchMetrics.samples} samples ({batchMetrics.simulationDelta.toLocaleString(undefined, { maximumFractionDigits: 3 })} model units) · next {batchMetrics.nextBatchSamples} samples · response {Math.round(batchMetrics.responseMs)} ms · visual delay {batchMetrics.renderDelayMs === null ? 'measuring' : `${Math.round(batchMetrics.renderDelayMs)} ms`}
                </span>
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
          ) : null}
        </div>
      </section>

      {runtimeInputEditing && runtimeVariables.length > 0 ? (
        <section className="mb-5 rounded-2xl border border-[#315057] bg-[#102126] p-4" aria-labelledby="digital-twin-runtime-inputs-title">
          <div className="mb-3">
            <h3 id="digital-twin-runtime-inputs-title" className="text-sm font-semibold text-white">Changes during execution</h3>
            <p className="mt-1 text-xs text-[#9ab8bd]">
              {mode === 'step'
                ? 'Changes are sent before the next step.'
                : 'Changes are sent before the next batch; network and model response time determine when they take effect.'}
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {runtimeVariables.map((variable) => (
              <DigitalTwinInput
                key={variable.name}
                variable={variable}
                modelVariables={modelVariables}
                value={values[variable.name]}
                onChange={onInputChange}
                disabled={!runtimeInputEditing}
              />
            ))}
          </div>
        </section>
      ) : null}
    </>
  )
}

DigitalTwinExecutionControls.propTypes = {
  executionMode: PropTypes.oneOf(['batch', 'step', 'continuous']).isRequired,
  onExecutionModeChange: PropTypes.func.isRequired,
  executionModes: PropTypes.arrayOf(PropTypes.oneOf(['batch', 'step', 'continuous'])).isRequired,
  running: PropTypes.bool.isRequired,
  status: PropTypes.string.isRequired,
  mode: PropTypes.oneOf(['step', 'continuous']),
  simulationTime: PropTypes.number.isRequired,
  batchMetrics: PropTypes.shape({
    responseMs: PropTypes.number,
    renderDelayMs: PropTypes.number,
    simulationDelta: PropTypes.number.isRequired,
    nextBatchSamples: PropTypes.number.isRequired,
    samples: PropTypes.number.isRequired,
  }),
  values: PropTypes.object.isRequired,
  modelVariables: PropTypes.arrayOf(PropTypes.object).isRequired,
  runtimeVariables: PropTypes.arrayOf(PropTypes.object).isRequired,
  runtimeInputEditing: PropTypes.bool.isRequired,
  onInputChange: PropTypes.func.isRequired,
  onAdvanceStep: PropTypes.func.isRequired,
  onToggleContinuous: PropTypes.func.isRequired,
  onEnd: PropTypes.func.isRequired,
  onCancel: PropTypes.func.isRequired,
}
