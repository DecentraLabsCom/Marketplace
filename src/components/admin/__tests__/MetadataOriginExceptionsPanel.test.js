import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import MetadataOriginExceptionsPanel from '../MetadataOriginExceptionsPanel'

describe('MetadataOriginExceptionsPanel', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  test('shows the owner and reason for reviewed global exceptions', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        exceptions: [{
          origin: 'https://research-cdn.example.edu',
          owner: 'Research infrastructure team',
          reason: 'Shared metadata CDN',
          createdAt: '2026-01-01T00:00:00.000Z',
        }],
      }),
    })
    const user = userEvent.setup()

    render(<MetadataOriginExceptionsPanel onError={jest.fn()} />)
    await user.click(screen.getByRole('button', { name: /manage exceptions/i }))

    expect(await screen.findByText('https://research-cdn.example.edu')).toBeInTheDocument()
    expect(screen.getByText(/Research infrastructure team/)).toBeInTheDocument()
    expect(screen.getByText(/Shared metadata CDN/)).toBeInTheDocument()
  })

  test('requires confirmation before revoking a global exception', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          exceptions: [{
            origin: 'https://research-cdn.example.edu',
            owner: 'Research infrastructure team',
            reason: 'Shared metadata CDN',
          }],
        }),
      })
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ exceptions: [] }) })
    const user = userEvent.setup()

    render(<MetadataOriginExceptionsPanel onError={jest.fn()} />)
    await user.click(screen.getByRole('button', { name: /manage exceptions/i }))
    await user.click(await screen.findByRole('button', { name: /revoke exception/i }))

    const dialog = screen.getByRole('dialog', { name: /revoke metadata trust exception/i })
    expect(within(dialog).getByText(/may no longer load metadata or declared media/i)).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: /revoke exception/i }))

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/admin/metadata-origin-exceptions',
        expect.objectContaining({ method: 'DELETE', credentials: 'include' })
      )
    })
  })
})
