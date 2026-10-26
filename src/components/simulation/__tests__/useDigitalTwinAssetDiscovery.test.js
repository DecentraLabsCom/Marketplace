import { act, renderHook, waitFor } from '@testing-library/react'
import useDigitalTwinAssetDiscovery from '../useDigitalTwinAssetDiscovery'

describe('useDigitalTwinAssetDiscovery', () => {
  const originalFetch = global.fetch

  afterEach(() => {
    global.fetch = originalFetch
    jest.clearAllMocks()
  })

  test('prefers a provider Three.js app over a GLB and returns AAS variables', async () => {
    const digest = 'b'.repeat(64)
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        simulationVariables: [{ name: 'speed', causality: 'input' }],
        visualAssets: [
          { contentType: 'model/gltf-binary', url: `/digital-twin-scenes/42/${'a'.repeat(64)}.glb` },
          { contentType: 'text/html', url: `https://gateway.example/digital-twin-apps/42/${digest}/index.html` },
        ],
      }),
    })
    const { result } = renderHook(() => useDigitalTwinAssetDiscovery({
      labId: '42',
      accessUri: 'https://gateway.example/guacamole',
    }))

    await waitFor(() => expect(result.current.state).toBe('ready'))

    expect(global.fetch).toHaveBeenCalledWith('/api/aas/shell?labId=42', expect.objectContaining({
      cache: 'no-store',
      signal: expect.any(AbortSignal),
    }))
    expect(result.current.asset).toEqual({
      type: 'threejs-app',
      url: `/api/aas/digital-twin-app/42/${digest}/index.html`,
    })
    expect(result.current.simulationVariables).toEqual([{ name: 'speed', causality: 'input' }])
  })

  test('clears asset state when lab selection changes to an empty lab', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ visualAssets: [] }) })
    const { result, rerender } = renderHook(
      ({ labId }) => useDigitalTwinAssetDiscovery({ labId, accessUri: 'https://gateway.example/' }),
      { initialProps: { labId: '42' } },
    )
    await waitFor(() => expect(result.current.state).toBe('ready'))

    rerender({ labId: '' })

    await waitFor(() => expect(result.current).toEqual({ asset: null, state: 'ready', simulationVariables: null }))
  })
})
