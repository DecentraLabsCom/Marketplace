'use client'

import PropTypes from 'prop-types'
import { Pencil, Trash2 } from 'lucide-react'
import VariableDescriptionTooltip from '../controls/VariableDescriptionTooltip'
import SimulationLineChart from './SimulationLineChart'

export default function SimulationGraphPanel({
  graphs,
  page,
  results,
  modelVariables,
  inputValues,
  timeUnit,
  onEditGraph,
  onDeleteGraph,
}) {
  const visibleGraphs = graphs.slice(page * 2, page * 2 + 2)

  return (
    <section aria-label="Simulation graphs" className="flex min-h-80 min-w-0 flex-col overflow-hidden lg:h-full lg:min-h-0">
      {visibleGraphs.length > 0 ? (
        <div className={`grid min-h-0 flex-1 gap-2 ${visibleGraphs.length === 1 ? 'grid-rows-1' : 'grid-rows-2'}`}>
          {visibleGraphs.map((graph) => (
            <article key={graph.id} className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-lg border border-[#26383f] bg-[#0b141a]">
              <div className="flex h-8 shrink-0 items-center justify-between gap-2 border-b border-[#26383f] px-2">
                <h4 className="min-w-0 truncate text-[10px] font-semibold uppercase tracking-[0.12em] text-[#829ba1]" title={graph.name}>{graph.name}</h4>
                <div className="flex shrink-0 items-center gap-0.5">
                  <VariableDescriptionTooltip name="Edit graph" description="Change this graph's name, X variable, or Y variables." portal align="left">
                    <button type="button" aria-label={`Edit ${graph.name}`} onClick={() => onEditGraph(graph.id)} className="grid size-6 place-items-center rounded text-[#9ab0b4] hover:bg-[#183d3e] hover:text-[#9dfff0] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#54d5c9]"><Pencil size={12} aria-hidden="true" /></button>
                  </VariableDescriptionTooltip>
                  <VariableDescriptionTooltip name="Delete graph" description="Remove this graph from the simulation panel." portal align="left">
                    <button type="button" aria-label={`Delete ${graph.name}`} onClick={() => onDeleteGraph(graph.id)} className="grid size-6 place-items-center rounded text-[#b58b8e] hover:bg-[#46272c] hover:text-[#ffbac0] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f08088]"><Trash2 size={12} aria-hidden="true" /></button>
                  </VariableDescriptionTooltip>
                </div>
              </div>
              <div className="min-h-0 flex-1 p-1">
                <SimulationLineChart graph={graph} results={results} modelVariables={modelVariables} inputValues={inputValues} timeUnit={timeUnit} />
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="grid flex-1 place-items-center p-4 text-center text-xs text-[#829ba1]">Open graph configuration to add your first graph.</div>
      )}
    </section>
  )
}

SimulationGraphPanel.propTypes = {
  graphs: PropTypes.arrayOf(PropTypes.object).isRequired,
  page: PropTypes.number.isRequired,
  results: PropTypes.object,
  modelVariables: PropTypes.arrayOf(PropTypes.object),
  inputValues: PropTypes.object,
  timeUnit: PropTypes.string,
  onEditGraph: PropTypes.func.isRequired,
  onDeleteGraph: PropTypes.func.isRequired,
}
