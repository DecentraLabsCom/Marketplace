import PropTypes from 'prop-types'

export default function SspTopology({ metadata, compact = false }) {
  if (!metadata) return null

  const components = Array.isArray(metadata.components) ? metadata.components : []
  const connections = Array.isArray(metadata.connections) ? metadata.connections : []
  const variants = Array.isArray(metadata.variants) ? metadata.variants : []

  return (
    <section className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        {components.map((component) => (
          <article
            key={component.name}
            className="rounded border border-[#2a2f33] bg-[#181b1d] p-3"
          >
            <div className="flex items-start justify-between gap-2">
              <h4 className="text-sm font-semibold text-neutral-100">{component.name}</h4>
              {component.source && (
                <span className="shrink-0 rounded bg-[#2a2f33] px-2 py-0.5 text-[11px] text-neutral-300">
                  FMU
                </span>
              )}
            </div>
            {component.source && (
              <p className="mt-1 truncate text-xs text-neutral-400" title={component.source}>
                {component.source}
              </p>
            )}
            {!compact && Array.isArray(component.connectors) && component.connectors.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {component.connectors.map((connector) => (
                  <span
                    key={`${component.name}:${connector.name}`}
                    className="rounded border border-[#3a4147] px-1.5 py-0.5 text-[11px] text-neutral-300"
                    title={[connector.kind, connector.type].filter(Boolean).join(' ')}
                  >
                    {connector.name}
                  </span>
                ))}
              </div>
            )}
          </article>
        ))}
      </div>

      {connections.length > 0 && (
        <div className="rounded border border-[#2a2f33] bg-[#1f2426] p-3">
          <h4 className="mb-2 text-sm font-semibold text-neutral-100">Connections</h4>
          <ul className="space-y-1 text-xs text-neutral-300">
            {connections.map((connection, index) => (
              <li key={`${connection.startElement}-${connection.endElement}-${index}`} className="truncate">
                <span className="font-medium text-neutral-100">{connection.startElement}</span>
                {connection.startConnector ? `.${connection.startConnector}` : ''}
                <span className="px-2 text-neutral-500">to</span>
                <span className="font-medium text-neutral-100">{connection.endElement}</span>
                {connection.endConnector ? `.${connection.endConnector}` : ''}
              </li>
            ))}
          </ul>
        </div>
      )}

      {variants.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {variants.map((variant) => (
            <span key={variant.name} className="rounded bg-[#2a2f33] px-2 py-1 text-xs text-neutral-300">
              {variant.name}
            </span>
          ))}
        </div>
      )}
    </section>
  )
}

SspTopology.propTypes = {
  metadata: PropTypes.shape({
    components: PropTypes.array,
    connections: PropTypes.array,
    variants: PropTypes.array,
  }),
  compact: PropTypes.bool,
}
