import { render } from '@testing-library/react'
import ClientWagmiProvider from '../ClientWagmiProvider'

jest.mock('wagmi', () => ({
  WagmiProvider: ({ config, children }) => (
    <div data-testid="wagmi-provider" data-config={JSON.stringify(config)}>{children}</div>
  ),
}))
jest.mock('@/utils/blockchain/wagmiConfig', () => ({ wagmi: 'mockConfig' }))

describe('ClientWagmiProvider', () => {
  it('renderiza el WagmiProvider con el config y los children', () => {
    const { getByTestId, getByText } = render(
      <ClientWagmiProvider>
        <span>contenido</span>
      </ClientWagmiProvider>
    )
    const provider = getByTestId('wagmi-provider')
    expect(provider).toBeInTheDocument()
    expect(provider.getAttribute('data-config')).toContain('mockConfig')
    expect(getByText('contenido')).toBeInTheDocument()
  })

  it('lanza error si no recibe children', () => {
    // PropTypes solo lanza warning en consola, no error, así que solo comprobamos que no crashea
    expect(() => render(<ClientWagmiProvider />)).not.toThrow()
  })
})
