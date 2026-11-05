import { postSimulationStream } from '../utils/simulationStreamTransport'

test('posts JSON with cancellation and no-store through the supplied transport', async () => {
  const response = { ok: true }
  const fetchImpl = jest.fn().mockResolvedValue(response)
  const controller = new AbortController()
  const body = { parameters: {}, options: { startTime: 0, stopTime: 1, stepSize: 0.1 } }

  await expect(postSimulationStream({
    url: '/api/simulations/stream',
    fetchImpl,
    credentials: 'include',
    signal: controller.signal,
    body,
  })).resolves.toBe(response)

  expect(fetchImpl).toHaveBeenCalledWith('/api/simulations/stream', {
    method: 'POST',
    cache: 'no-store',
    credentials: 'include',
    signal: controller.signal,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
})
