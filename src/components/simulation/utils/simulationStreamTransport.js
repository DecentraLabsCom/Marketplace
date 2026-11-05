/** Open a Marketplace or local-preview FMU batch stream. */
export function postSimulationStream({
  url,
  body,
  signal,
  fetchImpl = globalThis.fetch,
  credentials,
}) {
  if (typeof fetchImpl !== 'function') throw new Error('The simulation transport is unavailable.')
  return fetchImpl(url, {
    method: 'POST',
    cache: 'no-store',
    ...(credentials === undefined ? {} : { credentials }),
    ...(signal ? { signal } : {}),
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}
