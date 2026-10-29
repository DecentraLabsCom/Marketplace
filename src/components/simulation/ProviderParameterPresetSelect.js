'use client'

import PropTypes from 'prop-types'

export default function ProviderParameterPresetSelect({
  presets,
  selectedPresetId,
  onSelect,
  disabled = false,
}) {
  if (!Array.isArray(presets) || presets.length === 0) return null
  const selectedPreset = presets.find((preset) => preset.id === selectedPresetId)

  return (
    <label className="grid min-w-52 gap-1 text-xs text-text-secondary">
      <span className="font-medium">Provider configuration</span>
      <select
        value={selectedPresetId}
        onChange={(event) => onSelect(event.target.value)}
        disabled={disabled}
        className="min-h-10 rounded-lg border border-[#30464d] bg-[#142128] px-3 text-xs font-semibold text-[#dce9e9] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#54d5c9] disabled:cursor-not-allowed disabled:opacity-50"
        aria-label="Provider configuration"
      >
        <option value="">Custom configuration</option>
        {presets.map((preset) => (
          <option key={preset.id} value={preset.id}>{preset.name}</option>
        ))}
      </select>
      {selectedPreset?.description ? <span className="max-w-80 text-[11px]">{selectedPreset.description}</span> : null}
    </label>
  )
}

ProviderParameterPresetSelect.propTypes = {
  presets: PropTypes.arrayOf(PropTypes.shape({
    id: PropTypes.string.isRequired,
    name: PropTypes.string.isRequired,
    description: PropTypes.string,
    parameters: PropTypes.object.isRequired,
  })).isRequired,
  selectedPresetId: PropTypes.string.isRequired,
  onSelect: PropTypes.func.isRequired,
  disabled: PropTypes.bool,
}
