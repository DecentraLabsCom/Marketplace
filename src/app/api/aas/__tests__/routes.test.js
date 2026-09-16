/**
 * @jest-environment node
 */

import { clearRateLimitStoresForTests } from '@/utils/api/rateLimit'
import { GatewayValidationError } from '@/utils/api/gatewayProxy'
import { gatewayFetch, resolveLabAccessGateway } from '@/utils/api/gatewayProxy'
import { GET as getShell } from '../shell/route'
import { GET as getPackage } from '../package/route'

jest.mock('@/utils/dev/logger', () => ({
  log: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}))

jest.mock('@/utils/api/gatewayProxy', () => {
  const actual = jest.requireActual('@/utils/api/gatewayProxy')
  return {
    ...actual,
    gatewayFetch: jest.fn(),
    resolveLabAccessGateway: jest.fn(),
  }
})

const LAB_ID = '42'
const GATEWAY_ORIGIN = 'https://gateway.example.com'
const shellId = `urn:decentralabs:lab:${LAB_ID}`
const nameplateId = `${shellId}:sm:nameplate`
const simulationModelsId = `${shellId}:sm:simulationModels`
const technicalDataId = `${shellId}:sm:technicalData`

const request = (path) => new Request(`http://marketplace.example.com${path}`)
const responseJson = (response) => response.json()

const encodedAasId = (id) => Buffer.from(id).toString('base64url')

beforeEach(() => {
  jest.clearAllMocks()
  clearRateLimitStoresForTests()
  resolveLabAccessGateway.mockResolvedValue(GATEWAY_ORIGIN)
})

describe('GET /api/aas/shell', () => {
  test('validates labId before resolving a gateway', async () => {
    const response = await getShell(request('/api/aas/shell'))

    expect(response.status).toBe(400)
    await expect(responseJson(response)).resolves.toEqual({
      error: 'Missing required parameter: labId',
    })
    expect(resolveLabAccessGateway).not.toHaveBeenCalled()
    expect(gatewayFetch).not.toHaveBeenCalled()
  })

  test('fetches the shell and flattens optional Nameplate and SimulationModels properties', async () => {
    gatewayFetch
      .mockResolvedValueOnce(new Response(JSON.stringify({
        modelType: 'AssetAdministrationShell',
        id: shellId,
        submodels: [
          { keys: [{ type: 'Submodel', value: nameplateId }] },
          { keys: [{ type: 'Submodel', value: simulationModelsId }] },
          { keys: [{ type: 'Submodel', value: technicalDataId }] },
        ],
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        submodelElements: [
          { modelType: 'Property', idShort: 'ManufacturerName', value: 'DecentraLabs' },
          { modelType: 'Property', idShort: 'ModelNumber', value: 'FMU-42' },
        ],
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        submodelElements: [{
          modelType: 'SubmodelElementCollection',
          idShort: 'SimulationModel',
          value: [
            { modelType: 'Property', idShort: 'License', value: 'MIT' },
            { modelType: 'Property', idShort: 'DocumentationUrl', value: 'https://docs.example.com/fmu-42' },
            { modelType: 'Property', idShort: 'ContactEmail', value: 'owner@example.com' },
          ],
        }],
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        id: technicalDataId,
        idShort: 'TechnicalData',
        submodelElements: [
          { modelType: 'Property', idShort: 'ResourceStatus', value: 'Ready' },
          { modelType: 'Property', idShort: 'ReadyFlag', value: 'true' },
          { modelType: 'Property', idShort: 'ActiveSimulationCount', value: '2' },
          { modelType: 'Property', idShort: 'MaxConcurrentSimulations', value: '10' },
          { modelType: 'Property', idShort: 'LastSyncTimestamp', value: '2026-09-16T10:00:00Z' },
        ],
      }), { status: 200 }))

    const response = await getShell(request(`/api/aas/shell?labId=${LAB_ID}`))

    expect(response.status).toBe(200)
    await expect(responseJson(response)).resolves.toEqual({
      shell: {
        modelType: 'AssetAdministrationShell',
        id: shellId,
        submodels: [
          { keys: [{ type: 'Submodel', value: nameplateId }] },
          { keys: [{ type: 'Submodel', value: simulationModelsId }] },
          { keys: [{ type: 'Submodel', value: technicalDataId }] },
        ],
      },
      nameplate: { ManufacturerName: 'DecentraLabs', ModelNumber: 'FMU-42' },
      simulationInfo: {
        license: 'MIT',
        documentationUrl: 'https://docs.example.com/fmu-42',
        documentationUrls: ['https://docs.example.com/fmu-42'],
        contactEmail: 'owner@example.com',
      },
      operationalInfo: {
        submodelId: technicalDataId,
        idShort: 'TechnicalData',
        status: 'Ready',
        ready: true,
        backendMode: null,
        modelAvailable: null,
        activeSessions: 2,
        maxConcurrentSessions: 10,
        lastHeartbeat: null,
        lastSync: '2026-09-16T10:00:00Z',
        localModeEnabled: null,
        localSessionActive: null,
      },
    })
    expect(resolveLabAccessGateway).toHaveBeenCalledWith({ labId: LAB_ID })
    expect(gatewayFetch).toHaveBeenNthCalledWith(
      1,
      `${GATEWAY_ORIGIN}/aas/shells/${encodedAasId(shellId)}`,
      { cache: 'no-store' },
    )
    expect(gatewayFetch).toHaveBeenNthCalledWith(
      2,
      `${GATEWAY_ORIGIN}/aas/submodels/${encodedAasId(nameplateId)}`,
      { cache: 'no-store' },
    )
    expect(gatewayFetch).toHaveBeenNthCalledWith(
      3,
      `${GATEWAY_ORIGIN}/aas/submodels/${encodedAasId(simulationModelsId)}`,
      { cache: 'no-store' },
    )
    expect(gatewayFetch).toHaveBeenNthCalledWith(
      4,
      `${GATEWAY_ORIGIN}/aas/submodels/${encodedAasId(technicalDataId)}`,
      { cache: 'no-store' },
    )
  })

  test('discovers arbitrary submodels from a linked external shell', async () => {
    const externalShellId = 'https://aas.provider.example/shells/remote-42'
    const externalNameplateId = 'https://aas.provider.example/submodels/nameplate-42'
    const externalOperationalId = 'https://aas.provider.example/submodels/operational-42'
    gatewayFetch
      .mockResolvedValueOnce(new Response(JSON.stringify({
        id: externalShellId,
        submodels: [
          { keys: [{ type: 'Submodel', value: externalNameplateId }] },
          { keys: [{ type: 'Submodel', value: externalOperationalId }] },
        ],
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        id: externalNameplateId,
        idShort: 'Nameplate',
        submodelElements: [{ modelType: 'Property', idShort: 'LabType', value: 'PhysicalLab' }],
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        id: externalOperationalId,
        idShort: 'OperationalStatus',
        submodelElements: [
          { modelType: 'Property', idShort: 'Status', value: 'Available' },
          { modelType: 'Property', idShort: 'Ready', value: 'true' },
          { modelType: 'Property', idShort: 'HeartbeatTimestamp', value: '2026-09-16T11:00:00Z' },
        ],
      }), { status: 200 }))

    const response = await getShell(request(`/api/aas/shell?labId=${LAB_ID}`))

    expect(response.status).toBe(200)
    await expect(responseJson(response)).resolves.toEqual(expect.objectContaining({
      shell: expect.objectContaining({ id: externalShellId }),
      nameplate: { LabType: 'PhysicalLab' },
      simulationInfo: null,
      operationalInfo: expect.objectContaining({
        submodelId: externalOperationalId,
        idShort: 'OperationalStatus',
        status: 'Available',
        ready: true,
        lastHeartbeat: '2026-09-16T11:00:00Z',
      }),
    }))
    expect(gatewayFetch).toHaveBeenNthCalledWith(
      2,
      `${GATEWAY_ORIGIN}/aas/submodels/${encodedAasId(externalNameplateId)}`,
      { cache: 'no-store' },
    )
    expect(gatewayFetch).toHaveBeenNthCalledWith(
      3,
      `${GATEWAY_ORIGIN}/aas/submodels/${encodedAasId(externalOperationalId)}`,
      { cache: 'no-store' },
    )
  })

  test('returns a stable notFound response for missing or Lite-mode shells', async () => {
    gatewayFetch.mockResolvedValueOnce(new Response('missing', { status: 404 }))

    const missingResponse = await getShell(request(`/api/aas/shell?labId=${LAB_ID}`))
    expect(missingResponse.status).toBe(404)
    await expect(responseJson(missingResponse)).resolves.toEqual({ notFound: true })

    clearRateLimitStoresForTests()
    gatewayFetch.mockResolvedValueOnce(new Response('forbidden', { status: 403 }))

    const liteResponse = await getShell(request(`/api/aas/shell?labId=${LAB_ID}`))
    expect(liteResponse.status).toBe(404)
    await expect(responseJson(liteResponse)).resolves.toEqual({
      notFound: true,
      reason: 'AAS is not available on this gateway (Lite mode)',
    })
  })

  test('keeps optional submodel failures non-fatal', async () => {
    gatewayFetch
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: shellId }), { status: 200 }))
      .mockRejectedValueOnce(new Error('nameplate unavailable'))
      .mockRejectedValueOnce(new Error('simulation metadata unavailable'))

    const response = await getShell(request(`/api/aas/shell?labId=${LAB_ID}`))

    expect(response.status).toBe(200)
    await expect(responseJson(response)).resolves.toEqual({
      shell: { id: shellId },
      nameplate: null,
      simulationInfo: null,
      operationalInfo: null,
    })
  })

  test('sanitizes upstream errors and preserves their status', async () => {
    gatewayFetch.mockResolvedValueOnce(new Response('secret backend details', { status: 502 }))

    const response = await getShell(request(`/api/aas/shell?labId=${LAB_ID}`))
    const body = await responseJson(response)

    expect(response.status).toBe(502)
    expect(body).toEqual(expect.objectContaining({
      error: 'The laboratory model could not be loaded.',
      code: 'AAS_GATEWAY_REQUEST_FAILED',
    }))
    expect(JSON.stringify(body)).not.toContain('secret backend details')
  })

  test('maps gateway validation and unexpected failures to public errors', async () => {
    resolveLabAccessGateway.mockRejectedValueOnce(new GatewayValidationError('invalid access URI', 400))

    const validationResponse = await getShell(request(`/api/aas/shell?labId=${LAB_ID}`))
    expect(validationResponse.status).toBe(400)
    await expect(responseJson(validationResponse)).resolves.toEqual(expect.objectContaining({
      error: 'The laboratory model request is invalid.',
      code: 'INVALID_GATEWAY_REQUEST',
    }))

    clearRateLimitStoresForTests()
    resolveLabAccessGateway.mockRejectedValueOnce(new Error('contract unavailable'))

    const failureResponse = await getShell(request(`/api/aas/shell?labId=${LAB_ID}`))
    expect(failureResponse.status).toBe(500)
    await expect(responseJson(failureResponse)).resolves.toEqual(expect.objectContaining({
      error: 'The laboratory model could not be loaded.',
      code: 'AAS_REQUEST_FAILED',
    }))
  })
})

describe('GET /api/aas/package', () => {
  test('validates labId before resolving a gateway', async () => {
    const response = await getPackage(request('/api/aas/package'))

    expect(response.status).toBe(400)
    await expect(responseJson(response)).resolves.toEqual({
      error: 'Missing required parameter: labId',
    })
    expect(resolveLabAccessGateway).not.toHaveBeenCalled()
  })

  test('streams the AASX package with download headers and encoded shell id', async () => {
    const bytes = new Uint8Array([0x50, 0x4b, 0x03, 0x04])
    gatewayFetch
      .mockResolvedValueOnce(new Response(JSON.stringify({
        modelType: 'AssetAdministrationShell',
        id: shellId,
        submodels: [{
          keys: [{ type: 'Submodel', value: nameplateId }],
        }, {
          keys: [{ type: 'Submodel', value: simulationModelsId }],
        }],
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(bytes, {
        status: 200,
        headers: { 'Content-Type': 'application/asset-administration-shell-package+xml' },
      }))

    const response = await getPackage(request(`/api/aas/package?labId=${LAB_ID}`))

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('application/asset-administration-shell-package+xml')
    expect(response.headers.get('content-disposition')).toBe('attachment; filename="lab-42.aasx"')
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(response.headers.get('content-length')).toBe(String(bytes.byteLength))
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes)
    expect(gatewayFetch).toHaveBeenCalledWith(
      `${GATEWAY_ORIGIN}/aas/shells/${encodedAasId(shellId)}`,
      { cache: 'no-store' },
    )
    expect(gatewayFetch).toHaveBeenCalledWith(
      `${GATEWAY_ORIGIN}/aas/serialization?aasIds=${encodedAasId(shellId)}&includeConceptDescriptions=true&submodelIds=${encodedAasId(nameplateId)}&submodelIds=${encodedAasId(simulationModelsId)}`,
      {
        cache: 'no-store',
        headers: { Accept: 'application/asset-administration-shell-package+xml' },
      },
    )
  })

  test('serializes a linked shell using the identifier returned by the provider', async () => {
    const bytes = new Uint8Array([0x50, 0x4b, 0x03, 0x04])
    const externalShellId = 'https://aas.provider.example/shells/remote-42'
    const externalSubmodelId = 'https://aas.provider.example/submodels/remote-42'
    gatewayFetch
      .mockResolvedValueOnce(new Response(JSON.stringify({
        id: externalShellId,
        submodels: [{ keys: [{ type: 'Submodel', value: externalSubmodelId }] }],
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(bytes, {
        status: 200,
        headers: { 'Content-Type': 'application/asset-administration-shell-package+xml' },
      }))

    const response = await getPackage(request(`/api/aas/package?labId=${LAB_ID}`))

    expect(response.status).toBe(200)
    expect(gatewayFetch).toHaveBeenCalledWith(
      `${GATEWAY_ORIGIN}/aas/serialization?aasIds=${encodedAasId(externalShellId)}&includeConceptDescriptions=true&submodelIds=${encodedAasId(externalSubmodelId)}`,
      {
        cache: 'no-store',
        headers: { Accept: 'application/asset-administration-shell-package+xml' },
      },
    )
  })

  test('does not treat a JSON response as an AASX package', async () => {
    gatewayFetch
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: shellId, submodels: [] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ notFound: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }))

    const response = await getPackage(request(`/api/aas/package?labId=${LAB_ID}`))
    const body = await responseJson(response)

    expect(response.status).toBe(502)
    expect(body).toEqual(expect.objectContaining({
      error: 'The laboratory package could not be downloaded.',
      code: 'AAS_GATEWAY_REQUEST_FAILED',
    }))
  })

  test('maps missing and Lite-mode packages to notFound', async () => {
    gatewayFetch.mockResolvedValueOnce(new Response('missing', { status: 404 }))
    const missingResponse = await getPackage(request(`/api/aas/package?labId=${LAB_ID}`))
    expect(missingResponse.status).toBe(404)
    await expect(responseJson(missingResponse)).resolves.toEqual({ notFound: true })

    clearRateLimitStoresForTests()
    gatewayFetch.mockResolvedValueOnce(new Response('forbidden', { status: 403 }))
    const liteResponse = await getPackage(request(`/api/aas/package?labId=${LAB_ID}`))
    expect(liteResponse.status).toBe(404)
    await expect(responseJson(liteResponse)).resolves.toEqual({
      notFound: true,
      reason: 'AAS is not available on this gateway (Lite mode)',
    })
  })

  test('sanitizes package gateway and resolver failures', async () => {
    gatewayFetch.mockResolvedValueOnce(new Response('private failure', { status: 500 }))
    const gatewayResponse = await getPackage(request(`/api/aas/package?labId=${LAB_ID}`))
    expect(gatewayResponse.status).toBe(500)
    await expect(responseJson(gatewayResponse)).resolves.toEqual(expect.objectContaining({
      error: 'The laboratory package could not be downloaded.',
      code: 'AAS_GATEWAY_REQUEST_FAILED',
    }))

    clearRateLimitStoresForTests()
    gatewayFetch.mockRejectedValueOnce(new Error('provider secret details'))
    const unexpectedResponse = await getPackage(request(`/api/aas/package?labId=${LAB_ID}`))
    expect(unexpectedResponse.status).toBe(500)
    const unexpectedBody = await responseJson(unexpectedResponse)
    expect(unexpectedBody).toEqual(expect.objectContaining({
      error: 'The laboratory package could not be downloaded.',
      code: 'AAS_REQUEST_FAILED',
    }))
    expect(JSON.stringify(unexpectedBody)).not.toContain('provider secret details')

    clearRateLimitStoresForTests()
    resolveLabAccessGateway.mockRejectedValueOnce(new GatewayValidationError('bad lab id', 400))
    const validationResponse = await getPackage(request(`/api/aas/package?labId=${LAB_ID}`))
    expect(validationResponse.status).toBe(400)
    await expect(responseJson(validationResponse)).resolves.toEqual(expect.objectContaining({
      error: 'The laboratory package request is invalid.',
      code: 'INVALID_GATEWAY_REQUEST',
    }))
  })
})
