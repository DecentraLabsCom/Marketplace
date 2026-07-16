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
})
