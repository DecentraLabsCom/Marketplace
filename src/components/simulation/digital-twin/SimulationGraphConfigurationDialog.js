'use client'

import { useEffect, useMemo, useState } from 'react'
import PropTypes from 'prop-types'
import { Plus, Trash2 } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import { getDependentOutputRecommendations } from '@decentralabs/digital-twin-app-protocol'
import {
  getGraphableVariables,
  getGraphVariableLabel,
  SIMULATION_TIME_VARIABLE,
} from '../utils/simulationGraphData'
import { sortVariablesAlphabetically } from '../utils/sortVariablesAlphabetically'

const fieldClassName = 'w-full rounded-lg border border-[#344d54] bg-[#0d181d] px-3 py-2 text-sm text-white outline-none focus:border-[#57ded0] focus:ring-2 focus:ring-[#57ded0]/30'

export default function SimulationGraphConfigurationDialog({
  isOpen,
  onClose,
  graphs,
  selectedGraphId,
  modelVariables,
  modelStructure,
  timeUnit,
  onSelectGraph,
  onAddGraph,
  onSaveGraph,
  onDeleteGraph,
}) {
  const [draft, setDraft] = useState(null)
  const selectedGraph = graphs.find((graph) => graph.id === selectedGraphId) || graphs[0] || null
  const graphableVariables = useMemo(() => sortVariablesAlphabetically(getGraphableVariables(modelVariables)), [modelVariables])
  const variablesByName = useMemo(() => new Map(modelVariables.map((variable) => [variable.name, variable])), [modelVariables])
  const independentVariables = graphableVariables.filter((variable) => variable.causality === 'independent')
  const yVariables = graphableVariables.filter((variable) => ['input', 'output'].includes(variable.causality))
  const inputs = yVariables.filter((variable) => variable.causality === 'input')
  const outputs = yVariables.filter((variable) => variable.causality === 'output')
  const selectedInputNames = draft ? [
    ...(variablesByName.get(draft.xVariable)?.causality === 'input' ? [draft.xVariable] : []),
    ...draft.yVariables.filter((name) => variablesByName.get(name)?.causality === 'input'),
  ] : []
  const outputRecommendations = new Map(getDependentOutputRecommendations(modelStructure, selectedInputNames)
    .map(({ outputName, dependencyNames }) => [outputName, dependencyNames]))
  const outputsWithDeclaredDependencies = new Set(
    (Array.isArray(modelStructure?.outputs) ? modelStructure.outputs : [])
      .filter((entry) => typeof entry?.name === 'string'
        && Array.isArray(entry.dependencyNames)
        && entry.dependencyNames.length > 0)
      .map((entry) => entry.name),
  )
  const orderedYOutputs = [
    ...outputs.filter((variable) => outputsWithDeclaredDependencies.has(variable.name)),
    ...outputs.filter((variable) => !outputsWithDeclaredDependencies.has(variable.name)),
  ]

  useEffect(() => {
    setDraft(isOpen && selectedGraph
      ? { ...selectedGraph, yVariables: [...selectedGraph.yVariables] }
      : null)
  }, [graphs, isOpen, selectedGraphId])

  const updateDraft = (key, value) => setDraft((current) => current ? { ...current, [key]: value } : current)
  const toggleYVariable = (name) => setDraft((current) => {
    if (!current) return current
    const selected = new Set(current.yVariables)
    if (selected.has(name)) selected.delete(name)
    else selected.add(name)
    return { ...current, yVariables: [...selected] }
  })
  const handleAddGraph = () => {
    if (draft) onSaveGraph(draft)
    const graph = onAddGraph()
    if (graph) onSelectGraph(graph.id)
  }
  const handleSave = () => {
    if (draft) onSaveGraph({ ...draft, name: draft.name.trim() || 'Untitled graph' })
    onClose()
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Configure simulation graphs"
      titleAside="Choose one X variable and one or more inputs or outputs for Y."
      size="3xl"
      theme="dark"
      portal
      className="border border-[#2c454c] bg-[#101a20] text-white"
    >
      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex min-w-0 flex-1 gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Configured graphs">
            {graphs.map((graph, index) => (
              <button key={graph.id} type="button" role="tab" aria-selected={graph.id === selectedGraph?.id} onClick={() => onSelectGraph(graph.id)} className={`shrink-0 rounded-lg border px-3 py-2 text-xs font-medium transition ${graph.id === selectedGraph?.id ? 'border-[#57ded0] bg-[#173e40] text-white' : 'border-[#344d54] bg-[#142128] text-[#a9bec2] hover:text-white'}`}>
                {graph.name || `Graph ${index + 1}`}
              </button>
            ))}
          </div>
          <button type="button" onClick={handleAddGraph} className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-[#35736f] bg-[#173e40] px-3 py-2 text-xs font-semibold text-[#b8fff1] hover:bg-[#205856]">
            <Plus size={14} aria-hidden="true" /> Add graph
          </button>
          {selectedGraph ? (
            <button type="button" onClick={() => onDeleteGraph(selectedGraph.id)} aria-label={`Delete ${selectedGraph.name}`} className="grid size-9 shrink-0 place-items-center rounded-lg border border-[#6a3b41] text-[#f4a4aa] hover:bg-[#46272c]">
              <Trash2 size={15} aria-hidden="true" />
            </button>
          ) : null}
        </div>

        {draft ? (
          <div className="grid gap-5 md:grid-cols-2">
            <div className="space-y-4">
              <label className="block space-y-1.5 text-xs font-medium text-[#a9bec2]">
                Graph name
                <input value={draft.name} onChange={(event) => updateDraft('name', event.target.value)} maxLength={64} className={fieldClassName} />
              </label>
              <label className="block space-y-1.5 text-xs font-medium text-[#a9bec2]">
                X axis
                <select value={draft.xVariable} onChange={(event) => updateDraft('xVariable', event.target.value)} className={fieldClassName}>
                  {independentVariables.length > 0 ? (
                    <optgroup label="Independent variable">
                      {independentVariables.map((variable) => (
                        <option key={variable.name} value={variable.name}>{getGraphVariableLabel(variable)}</option>
                      ))}
                    </optgroup>
                  ) : null}
                  <optgroup label="Simulation time">
                    <option value={SIMULATION_TIME_VARIABLE}>{getGraphVariableLabel(null, timeUnit)}</option>
                  </optgroup>
                  {inputs.length > 0 ? (
                    <optgroup label="Inputs">
                      {inputs.map((variable) => (
                        <option key={variable.name} value={variable.name}>{getGraphVariableLabel(variable, timeUnit)}</option>
                      ))}
                    </optgroup>
                  ) : null}
                  {outputs.length > 0 ? (
                    <optgroup label="Outputs">
                      {outputs.map((variable) => (
                        <option key={variable.name} value={variable.name}>{getGraphVariableLabel(variable, timeUnit)}</option>
                      ))}
                    </optgroup>
                  ) : null}
                </select>
              </label>
              <p className="text-[11px] leading-relaxed text-[#829ba1]">
                The model independent variable is selected by default when available; simulation time is used otherwise.
              </p>
            </div>
            <div className="space-y-3">
              <p className="text-xs font-medium text-[#a9bec2]">Y axis variables</p>
              <p className="text-[11px] leading-relaxed text-[#829ba1]">Declared dependencies highlight related outputs as suggestions. Every variable remains available.</p>
              {outputs.length || inputs.length ? (
                <div className="max-h-72 space-y-4 overflow-y-auto rounded-lg border border-[#26383f] bg-[#0d181d] p-3">
                  {[['Outputs', orderedYOutputs], ['Inputs', inputs]].map(([heading, variables]) => variables.length > 0 ? (
                    <fieldset key={heading}>
                      <legend className="mb-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#67d7cf]">{heading}</legend>
                      <div className="space-y-2">
                        {variables.map((variable) => (
                          <label key={variable.name} className="flex cursor-pointer items-start gap-2 text-xs text-[#d2e2e4]">
                            <input type="checkbox" checked={draft.yVariables.includes(variable.name)} onChange={() => toggleYVariable(variable.name)} className="size-4 accent-[#57ded0]" />
                            <span className="min-w-0">
                              <span className="block truncate" title={variable.name}>{getGraphVariableLabel(variable)}</span>
                              {heading === 'Outputs' && outputRecommendations.has(variable.name) ? (
                                <small className="mt-0.5 block text-[10px] leading-relaxed text-[#74d9bf]">
                                  Declared dependency on {outputRecommendations.get(variable.name).join(', ')}
                                </small>
                              ) : null}
                            </span>
                          </label>
                        ))}
                      </div>
                    </fieldset>
                  ) : null)}
                </div>
              ) : (
                <p className="rounded-lg border border-dashed border-[#344d54] p-3 text-xs text-[#829ba1]">No scalar input or output variables are available for Y.</p>
              )}
            </div>
          </div>
        ) : (
          <p className="rounded-lg border border-dashed border-[#344d54] p-6 text-center text-sm text-[#829ba1]">Add a graph to configure its axes.</p>
        )}

        <div className="flex justify-end gap-2 border-t border-[#26383f] pt-4">
          <button type="button" onClick={onClose} className="rounded-lg border border-[#344d54] px-4 py-2 text-sm text-[#c5d7d9] hover:bg-[#1b2b31]">Cancel</button>
          <button type="button" onClick={handleSave} disabled={!draft} className="rounded-lg border border-[#35736f] bg-[#173e40] px-4 py-2 text-sm font-semibold text-[#b8fff1] hover:bg-[#205856] disabled:cursor-not-allowed disabled:opacity-50">Save graph</button>
        </div>
      </div>
    </Modal>
  )
}

SimulationGraphConfigurationDialog.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  graphs: PropTypes.arrayOf(PropTypes.object).isRequired,
  selectedGraphId: PropTypes.string,
  modelVariables: PropTypes.arrayOf(PropTypes.object),
  modelStructure: PropTypes.object,
  timeUnit: PropTypes.string,
  onSelectGraph: PropTypes.func.isRequired,
  onAddGraph: PropTypes.func.isRequired,
  onSaveGraph: PropTypes.func.isRequired,
  onDeleteGraph: PropTypes.func.isRequired,
}
