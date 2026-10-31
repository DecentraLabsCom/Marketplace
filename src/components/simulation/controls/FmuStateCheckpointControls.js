'use client'

import { useRef, useState } from 'react'
import PropTypes from 'prop-types'

const CHECKPOINT_FIELDS = new Set(['format', 'checkpointId', 'scope', 'createdAt', 'expiresAt', 'signature'])

function normalizeBundle(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || value.version !== 1
    || !Number.isFinite(value.simTime) || !value.checkpoint || typeof value.checkpoint !== 'object'
    || Array.isArray(value.checkpoint)) return null
  const checkpoint = value.checkpoint
  if (Object.keys(checkpoint).length !== CHECKPOINT_FIELDS.size
    || Object.keys(checkpoint).some((key) => !CHECKPOINT_FIELDS.has(key))
    || checkpoint.format !== 'decentralabs-fmi-state-v1'
    || typeof checkpoint.checkpointId !== 'string' || !/^[a-f\d]{32}$/.test(checkpoint.checkpointId)
    || typeof checkpoint.scope !== 'string' || !/^[a-f\d]{64}$/.test(checkpoint.scope)
    || typeof checkpoint.signature !== 'string' || !/^[a-f\d]{64}$/.test(checkpoint.signature)
    || !Number.isFinite(checkpoint.createdAt) || !Number.isFinite(checkpoint.expiresAt)
    || checkpoint.expiresAt <= checkpoint.createdAt || checkpoint.expiresAt <= Date.now() / 1000) return null
  return { version: 1, simTime: value.simTime, checkpoint }
}

export default function FmuStateCheckpointControls({
  available,
  checkpoint,
  onCheckpointChange,
  captureOnCompletion,
  onCaptureOnCompletionChange,
  resumeFromCheckpoint,
  onResumeFromCheckpointChange,
  onCaptureNow,
  captureNowAvailable = false,
  busy = false,
  captureNowBusy = busy,
  error = '',
}) {
  const fileInputRef = useRef(null)
  const [fileError, setFileError] = useState('')
  const normalizedCheckpoint = normalizeBundle(checkpoint)
  if (!available) return null

  async function handleImport(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    setFileError('')
    if (!file) return
    if (file.size > 16 * 1024) {
      setFileError('The checkpoint file must be 16 KiB or smaller.')
      return
    }
    try {
      const imported = normalizeBundle(JSON.parse(await file.text()))
      if (!imported) throw new Error('Checkpoint file format is invalid.')
      onCheckpointChange(imported)
      onResumeFromCheckpointChange(false)
    } catch (error) {
      setFileError(error?.message || 'Checkpoint file could not be read.')
    }
  }

  function handleExport() {
    if (!normalizedCheckpoint) return
    const blob = new Blob([JSON.stringify(normalizedCheckpoint, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `fmu-state-${normalizedCheckpoint.simTime.toFixed(3)}s.json`
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-[#30464d] bg-[#142128] px-3 py-2 text-xs text-[#b8d2d5]" aria-label="Save and load lab state">
      <label className="inline-flex items-center gap-2" title="Capture the FMU state when this run finishes. Checkpoints are tied to this model and reservation and expire after 24 hours.">
        <input
          type="checkbox"
          checked={captureOnCompletion}
          onChange={(event) => onCaptureOnCompletionChange(event.target.checked)}
          disabled={busy}
          className="accent-[#54d5c9]"
        />
        Save final state
      </label>
      {normalizedCheckpoint ? (
        <>
          <label className="inline-flex items-center gap-2" title={`Resume from the saved FMU state at t = ${normalizedCheckpoint.simTime.toFixed(3)} s.`}>
            <input
              type="checkbox"
              checked={resumeFromCheckpoint}
              onChange={(event) => onResumeFromCheckpointChange(event.target.checked)}
              disabled={busy}
              className="accent-[#54d5c9]"
            />
            Resume at {normalizedCheckpoint.simTime.toFixed(3)} s
          </label>
          {captureNowAvailable && onCaptureNow ? (
              <button type="button" onClick={onCaptureNow} disabled={captureNowBusy} className="rounded-md border border-[#45636a] px-2.5 py-1.5 font-semibold text-[#dce9e9] hover:border-[#54d5c9] disabled:opacity-50">
              Save current state
            </button>
          ) : null}
          <button type="button" onClick={handleExport} disabled={busy} className="rounded-md border border-[#45636a] px-2.5 py-1.5 font-semibold text-[#dce9e9] hover:border-[#54d5c9] disabled:opacity-50">
            Download
          </button>
          <button type="button" onClick={() => { onCheckpointChange(null); onResumeFromCheckpointChange(false) }} disabled={busy} className="rounded-md border border-[#45636a] px-2.5 py-1.5 font-semibold text-[#dce9e9] hover:border-[#54d5c9] disabled:opacity-50">
            Clear
          </button>
        </>
      ) : captureNowAvailable && onCaptureNow ? (
        <button type="button" onClick={onCaptureNow} disabled={captureNowBusy} className="rounded-md border border-[#45636a] px-2.5 py-1.5 font-semibold text-[#dce9e9] hover:border-[#54d5c9] disabled:opacity-50">
          Save current state
        </button>
      ) : null}
      <button type="button" onClick={() => fileInputRef.current?.click()} disabled={busy} className="rounded-md border border-[#45636a] px-2.5 py-1.5 font-semibold text-[#dce9e9] hover:border-[#54d5c9] disabled:opacity-50">
        Import
      </button>
      <input ref={fileInputRef} type="file" accept="application/json,.json" onChange={handleImport} className="hidden" aria-label="Import an FMU state checkpoint" />
      {fileError ? <span role="alert" className="w-full text-[#ffb5bd]">{fileError}</span> : null}
      {error ? <span role="alert" className="w-full text-[#ffb5bd]">{error}</span> : null}
    </div>
  )
}

FmuStateCheckpointControls.propTypes = {
  available: PropTypes.bool.isRequired,
  checkpoint: PropTypes.object,
  onCheckpointChange: PropTypes.func.isRequired,
  captureOnCompletion: PropTypes.bool.isRequired,
  onCaptureOnCompletionChange: PropTypes.func.isRequired,
  resumeFromCheckpoint: PropTypes.bool.isRequired,
  onResumeFromCheckpointChange: PropTypes.func.isRequired,
  onCaptureNow: PropTypes.func,
  captureNowAvailable: PropTypes.bool,
  captureNowBusy: PropTypes.bool,
  busy: PropTypes.bool,
  error: PropTypes.string,
}
