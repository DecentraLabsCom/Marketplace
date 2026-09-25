/** @jest-environment jsdom */

import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import AasPanel from '../AasPanel'

describe('AasPanel external links', () => {
  beforeEach(() => {
    global.fetch = jest.fn().mockResolvedValue({
      status: 200,
      ok: true,
      json: async () => ({
        shell: {
          assetInformation: { assetType: 'Simulation' },
          submodels: [],
        },
        nameplate: null,
        simulationInfo: {
          documentationUrl: 'javascript:alert(document.cookie)',
          contactEmail: 'provider@example.edu',
        },
      }),
    })
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  test('does not render an unsafe documentation URL as a link', async () => {
    render(<AasPanel labId="7" gatewayUrl="https://gateway.example/fmu" />)

    await waitFor(() => expect(screen.getByText('Digital Twin Metadata')).toBeInTheDocument())

    expect(screen.queryByRole('link', { name: 'javascript:alert(document.cookie)' })).toBeNull()
    expect(screen.getByRole('link', { name: /provider@example.edu/ })).toHaveAttribute(
      'href',
      'mailto:provider@example.edu',
    )
  })

  test('links to the raw AAS shell through the Marketplace proxy', async () => {
    render(<AasPanel labId="7" gatewayUrl="https://gateway.example/fmu" />)

    await waitFor(() => expect(screen.getByText('Digital Twin Metadata')).toBeInTheDocument())

    expect(screen.getByRole('link', { name: 'View raw AAS shell JSON through Marketplace proxy' })).toHaveAttribute(
      'href',
      '/api/aas/shell?labId=7&raw=true',
    )
    expect(screen.getByRole('link', { name: 'Download AASX package through Marketplace proxy' })).toHaveAttribute(
      'href',
      '/api/aas/package?labId=7',
    )
  })

  test('renders normalized operational metadata for any resource type', async () => {
    global.fetch.mockResolvedValueOnce({
      status: 200,
      ok: true,
      json: async () => ({
        shell: {
          id: 'https://aas.provider.example/shells/remote-7',
          assetInformation: { assetType: 'PhysicalLab' },
          submodels: [{}, {}],
        },
        nameplate: {
          LabType: 'PhysicalLab',
          License: 'https://provider.example/terms',
          DocumentationUrl_0: 'https://provider.example/manual.pdf',
          DocumentationUrl_1: 'https://provider.example/guide.pdf',
        },
        simulationInfo: null,
        executionInfo: {
          executionClass: 'PhysicalLaboratory',
          reservationRequired: true,
          authorizationScheme: 'ReservationScopedLabAccessCode',
          accessProtocol: 'Guacamole',
          operations: [
            { idShort: 'StartInteractiveSession', inputVariables: ['AccessCapability'], outputVariables: ['SessionHandle'] },
            { idShort: 'EndInteractiveSession', inputVariables: ['SessionHandle'], outputVariables: ['Status'] },
          ],
        },
        operationalInfo: {
          status: 'Ready',
          ready: true,
          backendMode: 'station',
          modelAvailable: null,
          activeSessions: 1,
          maxConcurrentSessions: 4,
          lastHeartbeat: '2026-09-16T11:00:00Z',
          lastSync: '2026-09-16T11:01:00Z',
          localModeEnabled: false,
          localSessionActive: false,
        },
      }),
    })

    render(<AasPanel labId="7" gatewayUrl="https://gateway.example/fmu" />)

    await waitFor(() => expect(screen.getByText('Last known operational Status')).toBeInTheDocument())

    expect(screen.getAllByText('Ready')).toHaveLength(1)
    expect(screen.queryByText('Ready', { selector: 'span' })).toBeNull()
    expect(screen.getByText('station')).toBeInTheDocument()
    expect(screen.getByText('1 / 4')).toBeInTheDocument()
    expect(screen.getAllByText('Yes')).toHaveLength(1)
    expect(screen.getAllByText('No')).toHaveLength(2)
    expect(screen.getByText('AAS snapshot synced at')).toBeInTheDocument()
    expect(screen.queryByText('Last synced:')).toBeNull()
    expect(
      screen.getByText('AAS snapshot synced at').compareDocumentPosition(screen.getByText('Last Heartbeat'))
        & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    expect(screen.getByText('https://provider.example/terms')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'https://provider.example/manual.pdf' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'https://provider.example/guide.pdf' })).toBeInTheDocument()
    expect(screen.getByText('https://aas.provider.example/shells/remote-7')).toBeInTheDocument()
    expect(screen.getByText('Execution Capabilities')).toBeInTheDocument()
    expect(screen.getByText('PhysicalLaboratory')).toBeInTheDocument()
    expect(screen.getByText('StartInteractiveSession, EndInteractiveSession')).toBeInTheDocument()
  })
})
