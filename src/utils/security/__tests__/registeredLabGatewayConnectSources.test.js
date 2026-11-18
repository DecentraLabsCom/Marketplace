jest.mock('@/app/api/contract/utils/contractInstance', () => ({
  getContractInstance: jest.fn(),
}))

import { getContractInstance } from '@/app/api/contract/utils/contractInstance'
import { getRegisteredLabGatewayConnectSources } from '../registeredLabGatewayConnectSources'

describe('getRegisteredLabGatewayConnectSources', () => {
  let contract

  beforeEach(() => {
    jest.clearAllMocks()
    contract = { getLab: jest.fn() }
    getContractInstance.mockResolvedValue(contract)
  })

  test('allows only the HTTPS and WebSocket origins registered for the requested lab', async () => {
    contract.getLab.mockResolvedValue([
      42n,
      [null, null, 'https://gateway.example:8443/guacamole?token=ignored'],
    ])

    await expect(getRegisteredLabGatewayConnectSources('42')).resolves.toEqual([
      'https://gateway.example:8443',
      'wss://gateway.example:8443',
    ])
    expect(contract.getLab).toHaveBeenCalledWith('42')
  })

  test('rejects invalid or mismatched lab IDs', async () => {
    await expect(getRegisteredLabGatewayConnectSources('../42')).resolves.toEqual([])
    expect(getContractInstance).not.toHaveBeenCalled()

    contract.getLab.mockResolvedValue([43n, [null, null, 'https://gateway.example']])
    await expect(getRegisteredLabGatewayConnectSources('42')).resolves.toEqual([])
  })

  test('allows HTTP only for loopback development gateways', async () => {
    contract.getLab.mockResolvedValue([42n, [null, null, 'http://localhost:3001/gateway']])

    await expect(getRegisteredLabGatewayConnectSources('42')).resolves.toEqual([])
    await expect(getRegisteredLabGatewayConnectSources('42', { isDevelopment: true })).resolves.toEqual([
      'http://localhost:3001',
      'ws://localhost:3001',
    ])
  })

  test('fails closed when the contract lookup fails', async () => {
    contract.getLab.mockRejectedValue(new Error('RPC unavailable'))

    await expect(getRegisteredLabGatewayConnectSources('42')).resolves.toEqual([])
  })
})
