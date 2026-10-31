'use client'

import { useEffect, useId, useState } from 'react'
import PropTypes from 'prop-types'
import { ChevronDown } from 'lucide-react'
import VariableDescriptionTooltip from './VariableDescriptionTooltip'

const PLAYBACK_RATE_PRESETS = [0.25, 0.5, 1, 2, 4, 8]
const MIN_PLAYBACK_RATE = 0.01
const MAX_PLAYBACK_RATE = 100_000
const PLAYBACK_RATE_DECIMAL_PLACES = 4
const PLAYBACK_RATE_SCALE = 10 ** PLAYBACK_RATE_DECIMAL_PLACES
const FIT_DURATION_OPTIONS = [10, 30, 60, 120, 300]

function formatRate(value) {
  return Number(value).toLocaleString(undefined, { maximumFractionDigits: 2 })
}

export default function PlaybackRateControl({ rate, onChange, modelDuration, disabled = false, compact = false }) {
  const controlId = useId()
  const numericRate = Number(rate)
  const validRate = Number.isFinite(numericRate) && numericRate > 0 ? numericRate : 1
  const [customMode, setCustomMode] = useState(() => !PLAYBACK_RATE_PRESETS.includes(validRate))
  const duration = Number(modelDuration)
  const canFitRun = Number.isFinite(duration) && duration > 0
  const [fitDuration, setFitDuration] = useState(30)
  const [customRateText, setCustomRateText] = useState(String(validRate))
  const [editingCustomRate, setEditingCustomRate] = useState(false)

  useEffect(() => {
    if (!editingCustomRate) setCustomRateText(String(validRate))
  }, [editingCustomRate, validRate])

  function updateRate(value) {
    const nextRate = Number(value)
    if (!Number.isFinite(nextRate) || nextRate < MIN_PLAYBACK_RATE || nextRate > MAX_PLAYBACK_RATE) return
    onChange(Math.round((nextRate + Number.EPSILON) * PLAYBACK_RATE_SCALE) / PLAYBACK_RATE_SCALE)
  }

  return (
    <div className={compact ? 'w-[min(13rem,calc(100vw-4rem))]' : 'w-full'}>
      <div className="grid gap-2">
        <div className="flex min-h-10 min-w-0 items-center gap-2 rounded-lg border border-[#30464d] bg-[#142128] px-3 text-xs text-[#a9bec2] transition focus-within:border-[#54d5c9] focus-within:ring-2 focus-within:ring-[#54d5c9]/30">
          <VariableDescriptionTooltip
            name="Replay speed"
            description="Controls how quickly the completed simulation is replayed; it does not change the model's execution speed."
          >
            <label htmlFor={`${controlId}-preset`} className="shrink-0 cursor-help">Replay speed</label>
          </VariableDescriptionTooltip>
          <span className="relative inline-flex min-h-8 min-w-0 flex-1 items-center">
            <select
              id={`${controlId}-preset`}
              aria-label="Replay speed"
              value={customMode ? 'custom' : String(validRate)}
              onChange={(event) => {
                if (event.target.value === 'custom') {
                  setCustomRateText(String(validRate))
                  setCustomMode(true)
                  if (canFitRun) updateRate(duration / Number(fitDuration))
                } else if (event.target.value) {
                  setCustomMode(false)
                  updateRate(event.target.value)
                }
              }}
              disabled={disabled}
              style={{
                colorScheme: 'dark',
                appearance: 'none',
                WebkitAppearance: 'none',
                MozAppearance: 'none',
                backgroundImage: 'none',
              }}
              className="h-8 min-w-0 w-full appearance-none border-0 bg-transparent py-0 pl-1 pr-6 text-xs font-semibold text-[#f1f7f8] shadow-none outline-none ring-0 focus:border-transparent focus:outline-none focus:ring-0 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {PLAYBACK_RATE_PRESETS.map((preset) => (
                <option
                  key={preset}
                  value={preset}
                  className="bg-[#101a20] text-sm font-medium text-[#f1f7f8] hover:bg-[#20b7aa] hover:text-[#061416] focus:bg-[#20b7aa] focus:text-[#061416]"
                >
                  {formatRate(preset)}×
                </option>
              ))}
              <option
                value="custom"
                className="bg-[#101a20] text-sm font-medium text-[#f1f7f8] hover:bg-[#20b7aa] hover:text-[#061416] focus:bg-[#20b7aa] focus:text-[#061416]"
              >
                Custom
              </option>
            </select>
            <ChevronDown size={14} aria-hidden="true" className="pointer-events-none absolute right-1 text-[#9ab8bd]" />
          </span>
        </div>
        {customMode && (
          <div className="grid grid-cols-2 gap-x-3 gap-y-2 rounded-lg border border-[#26383f] bg-[#101d23] p-3">
            <div className="grid min-w-0 content-start gap-1">
              <label htmlFor={`${controlId}-custom`} className="text-xs font-medium text-[#dce9e9]">Custom ×</label>
              <input
                id={`${controlId}-custom`}
                aria-label="Custom playback speed in model seconds per real second"
                type="number"
                min={MIN_PLAYBACK_RATE}
                max={MAX_PLAYBACK_RATE}
                step="0.0001"
                value={customRateText}
                onFocus={() => setEditingCustomRate(true)}
                onBlur={() => {
                  setEditingCustomRate(false)
                  const candidate = Number(customRateText)
                  if (!Number.isFinite(candidate) || candidate < MIN_PLAYBACK_RATE || candidate > MAX_PLAYBACK_RATE) {
                    setCustomRateText(String(validRate))
                  } else {
                    updateRate(candidate)
                  }
                }}
                onChange={(event) => {
                  const nextText = event.target.value
                  const fractionalPart = nextText.split(/[.,]/)[1]
                  if (fractionalPart?.length > PLAYBACK_RATE_DECIMAL_PLACES) return
                  setCustomRateText(nextText)
                  if (nextText === '' || /[.,]$/.test(nextText)) return
                  updateRate(nextText)
                }}
                disabled={disabled}
                className="min-h-9 w-[10ch] max-w-full rounded-md border border-[#30464d] bg-[#142128] px-1 text-sm text-white focus:border-[#54d5c9] focus:outline-none disabled:opacity-50"
              />
            </div>
            <div className="grid min-w-0 content-start gap-1">
              <label htmlFor={`${controlId}-fit-duration`} className="text-xs font-medium text-[#dce9e9]">Fit run to</label>
              <select
                id={`${controlId}-fit-duration`}
                aria-label="Fit simulation playback duration"
                value={fitDuration}
                onChange={(event) => {
                  const selectedDuration = event.target.value
                  setFitDuration(selectedDuration)
                  if (selectedDuration && canFitRun) updateRate(duration / Number(selectedDuration))
                }}
                disabled={disabled || !canFitRun}
                className="min-h-9 w-full rounded-md border border-[#30464d] bg-[#142128] px-2 text-sm text-white focus:border-[#54d5c9] focus:outline-none disabled:cursor-not-allowed disabled:opacity-40"
              >
                {FIT_DURATION_OPTIONS.map((seconds) => (
                  <option key={seconds} value={seconds}>{seconds} s</option>
                ))}
              </select>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

PlaybackRateControl.propTypes = {
  rate: PropTypes.number.isRequired,
  onChange: PropTypes.func.isRequired,
  modelDuration: PropTypes.number,
  disabled: PropTypes.bool,
  compact: PropTypes.bool,
}

PlaybackRateControl.defaultProps = {
  modelDuration: 0,
  disabled: false,
  compact: false,
}
