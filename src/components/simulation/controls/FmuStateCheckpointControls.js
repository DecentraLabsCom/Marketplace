'use client'

import PropTypes from 'prop-types'
import VariableDescriptionTooltip from './VariableDescriptionTooltip'

const CHECKPOINT_FIELDS = new Set(['format', 'checkpointId', 'scope', 'createdAt', 'expiresAt', 'signature'])

function normalizeBundle(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || value.version !== 1
    || !Number.isFinite(value.simTime) || !value.checkpoint || typeof value.checkpoint !== 'object'
    || Array.isArray(value.checkpoint)
    || Object.keys(value).some((key) => !['version', 'simTime', 'checkpoint', 'sample'].includes(key))) return null
  const checkpoint = value.checkpoint
  if (Object.keys(checkpoint).length !== CHECKPOINT_FIELDS.size
    || Object.keys(checkpoint).some((key) => !CHECKPOINT_FIELDS.has(key))
    || checkpoint.format !== 'decentralabs-fmi-state-v1'
    || typeof checkpoint.checkpointId !== 'string' || !/^[a-f\d]{32}$/.test(checkpoint.checkpointId)
    || typeof checkpoint.scope !== 'string' || !/^[a-f\d]{64}$/.test(checkpoint.scope)
    || typeof checkpoint.signature !== 'string' || !/^[a-f\d]{64}$/.test(checkpoint.signature)
    || !Number.isFinite(checkpoint.createdAt) || !Number.isFinite(checkpoint.expiresAt)
    || checkpoint.expiresAt <= checkpoint.createdAt || checkpoint.expiresAt <= Date.now() / 1000) return null
  const sample = value.sample
  if (sample !== undefined && (!sample || typeof sample !== 'object' || Array.isArray(sample)
    || Object.keys(sample).length !== 2 || !Number.isFinite(sample.time)
    || !sample.outputs || typeof sample.outputs !== 'object' || Array.isArray(sample.outputs)
    || Object.keys(sample.outputs).length > 512
    || Object.entries(sample.outputs).some(([name, item]) => !name || name.length > 256
      || !(typeof item === 'boolean' || (typeof item === 'number' && Number.isFinite(item)))))) return null
  return { version: 1, simTime: value.simTime, checkpoint, ...(sample ? { sample } : {}) }
}

const buttonClass = 'rounded-md border border-[#45636a] px-3 py-1.5 font-semibold text-[#dce9e9] hover:border-[#54d5c9]'

export default function FmuStateCheckpointControls({
  available,
  checkpoint,
  loaded = false,
  onSave,
  onLoad,
  onClear,
  saveAvailable = false,
  clearAvailable = false,
  busy = false,
  saving = false,
  layout = 'inline',
  error = '',
}) {
  const savedBundle = normalizeBundle(checkpoint)
  if (!available) return null

  const saveDescription = 'Save the simulation state to continue from it later.'
  const loadDescription = savedBundle?.sample
    ? loaded
      ? `The scene and indicators show the saved state. The next run resumes at t=${savedBundle.simTime.toFixed(3)} s, so choose an end time later than this.`
      : `Load the saved state at t=${savedBundle.simTime.toFixed(3)} s. Choose an end time later than this to continue.`
    : savedBundle
      ? `${loaded ? 'Loaded for the next run. Click again to cancel.' : `Continue from the saved state at ${savedBundle.simTime.toFixed(3)} s. Set the end time later than this point.`}`
    : 'Save a state first to continue from it.'
  const sectionClass = layout === 'compact'
    ? 'flex min-h-10 items-center rounded-lg border border-[#30464d] bg-[#142128] px-2 py-1 text-xs text-[#b8d2d5]'
    : 'rounded-lg border border-[#30464d] bg-[#142128] px-3 py-2 text-xs text-[#b8d2d5]'
  const controlsClass = layout === 'stacked'
    ? 'flex w-full flex-col items-stretch gap-1'
    : 'flex flex-wrap items-center gap-2'

  return (
    <section className={sectionClass} aria-label="Lab state">
      <div className={controlsClass}>
        <span className={`mr-1 font-semibold uppercase tracking-wide text-[#dce9e9] ${layout === 'stacked' ? 'self-center' : ''}`}>State</span>
        <div className={`flex items-center gap-2 ${layout === 'stacked' ? 'w-full flex-nowrap justify-center' : 'flex-wrap'}`}>
        <VariableDescriptionTooltip name="Save" description={saveDescription} portal>
          <button
            type="button"
            aria-disabled={busy || saving || !saveAvailable}
            onClick={(event) => {
              if (busy || saving || !saveAvailable) {
                event.preventDefault()
                return
              }
              onSave()
            }}
            className={`${buttonClass} ${layout === 'stacked' && saving ? 'min-w-[5rem]' : ''} ${busy || saving || !saveAvailable ? 'cursor-not-allowed opacity-40 hover:border-[#45636a]' : ''}`}
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </VariableDescriptionTooltip>
        <VariableDescriptionTooltip
          name="Load"
          description={loadDescription}
          portal
        >
          <button
            type="button"
            aria-disabled={busy || !savedBundle}
            aria-pressed={loaded}
            onClick={(event) => {
              if (busy || !savedBundle) {
                event.preventDefault()
                return
              }
              onLoad()
            }}
            className={`${buttonClass} ${loaded ? 'border-[#54d5c9] bg-[#173a3b] text-[#78e4d4]' : ''} ${busy || !savedBundle ? 'cursor-not-allowed opacity-40 hover:border-[#45636a]' : ''}`}
          >
            Load
          </button>
        </VariableDescriptionTooltip>
        <VariableDescriptionTooltip
          name="Clear"
          description="Remove the saved state."
          portal
        >
          <button
            type="button"
            aria-disabled={busy || !clearAvailable}
            onClick={(event) => {
              if (busy || !clearAvailable) {
                event.preventDefault()
                return
              }
              onClear()
            }}
            className={`${buttonClass} ${busy || !clearAvailable ? 'cursor-not-allowed opacity-40 hover:border-[#45636a]' : ''}`}
          >
            Clear
          </button>
        </VariableDescriptionTooltip>
        </div>
      </div>
      {error ? <p role="alert" className="mt-1 text-[11px] text-[#ffb5bd]">{error}</p> : null}
    </section>
  )
}

FmuStateCheckpointControls.propTypes = {
  available: PropTypes.bool.isRequired,
  checkpoint: PropTypes.object,
  loaded: PropTypes.bool,
  onSave: PropTypes.func.isRequired,
  onLoad: PropTypes.func.isRequired,
  onClear: PropTypes.func.isRequired,
  saveAvailable: PropTypes.bool,
  clearAvailable: PropTypes.bool,
  busy: PropTypes.bool,
  saving: PropTypes.bool,
  layout: PropTypes.oneOf(['inline', 'stacked', 'compact']),
  error: PropTypes.string,
}
