import { resolveDigitalTwinAsset, resolveGatewayOrigin } from '../digital-twin/digitalTwinAssets'

const digest = 'a'.repeat(64)

describe('digitalTwinAssets', () => {
  test('maps same-gateway GLB scene references to the protected Marketplace route', () => {
    expect(resolveDigitalTwinAsset({
      contentType: 'model/gltf-binary',
      url: `/digital-twin-scenes/42/${digest}.glb`,
    }, 'https://gateway.example', '42')).toEqual({
      type: 'glb',
      url: `/api/aas/digital-twin-scene/42/${digest}.glb`,
    })
  })

  test.each([
    ['/digital-twin-scenes/7/' + digest + '.glb', '42'],
    ['/digital-twin-scenes/42/' + digest + '.glb?download=1', '42'],
    ['/digital-twin-scenes/42/%2e%2e/' + digest + '.glb', '42'],
  ])('rejects an invalid or cross-lab scene reference %s', (url, labId) => {
    expect(resolveDigitalTwinAsset({ contentType: 'model/gltf-binary', url }, 'https://gateway.example', labId)).toBeNull()
  })

  test('accepts only a matching same-gateway Three.js app reference', () => {
    expect(resolveDigitalTwinAsset({
      contentType: 'text/html',
      url: `https://gateway.example/digital-twin-apps/42/${digest}/index.html`,
    }, 'https://gateway.example', '42')).toEqual({
      type: 'threejs-app',
      url: `/api/aas/digital-twin-app/42/${digest}/index.html`,
    })

    expect(resolveDigitalTwinAsset({
      contentType: 'text/html',
      url: `https://other.example/digital-twin-apps/42/${digest}/index.html`,
    }, 'https://gateway.example', '42')).toBeNull()
  })

  test('resolves only the origin from a configured gateway URL', () => {
    expect(resolveGatewayOrigin('https://gateway.example:9443/guacamole/context')).toBe('https://gateway.example:9443')
    expect(resolveGatewayOrigin('not a URL')).toBe('')
  })
})
