import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import InviteTokenPage from '../InviteTokenPage';

jest.mock('@/components/ui', () => ({
  Container: ({ children, className }) => <div className={className}>{children}</div>,
}));

describe('InviteTokenPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: jest.fn(),
      },
    });
  });

  test('shows access denied for non-platform admins', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ isPlatformAdmin: false }),
    });

    render(<InviteTokenPage />);

    expect(await screen.findByText('Access denied.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /generate/i })).not.toBeInTheDocument();
  });

  test('generates provider invite token for platform admins', async () => {
    const user = userEvent.setup();
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ isPlatformAdmin: true }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ records: [] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          token: 'mock-invite-token',
          expiresAt: '2026-06-13T10:00:00.000Z',
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ records: [] }),
      });

    render(<InviteTokenPage />);

    await screen.findByRole('button', { name: /generate/i });
    await user.type(screen.getByLabelText(/provider name/i), 'Partner Lab');
    await user.type(screen.getByLabelText(/provider email/i), 'admin@partner.org');
    await user.type(screen.getByLabelText(/provider organization/i), 'partner.org');
    await user.clear(screen.getByLabelText(/provider country/i));
    await user.type(screen.getByLabelText(/provider country/i), 'PT');
    await user.type(screen.getByLabelText(/public base url/i), 'https://gateway.partner.org');
    await user.type(screen.getByLabelText(/institutional wallet address/i), '0x1234567890123456789012345678901234567890');
    await user.type(screen.getByLabelText(/agreement id/i), 'AGR-2026-001');
    await user.click(screen.getByRole('button', { name: /generate/i }));

    const trustReview = screen.getByRole('dialog', { name: /review institutional trust/i })
    expect(within(trustReview).getByText('partner.org')).toBeInTheDocument()
    expect(within(trustReview).getByText('https://gateway.partner.org')).toBeInTheDocument()
    expect(global.fetch).not.toHaveBeenCalledWith(
      '/api/admin/institutions/provisionProvider',
      expect.anything(),
    )
    await user.click(within(trustReview).getByRole('checkbox', { name: /I have verified/i }))
    await user.click(within(trustReview).getByRole('button', { name: /generate provisioning token/i }))

    await waitFor(() => {
      expect(screen.getByDisplayValue('mock-invite-token')).toBeInTheDocument();
    });

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/admin/institutions/provisionProvider',
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
      })
    );
    const provisionRequest = global.fetch.mock.calls.find(([url]) => url === '/api/admin/institutions/provisionProvider');
    const body = JSON.parse(provisionRequest[1].body);
    expect(body).toMatchObject({
      registrationType: 'provider',
      providerName: 'Partner Lab',
      providerEmail: 'admin@partner.org',
      providerCountry: 'PT',
      providerOrganization: 'partner.org',
      publicBaseUrl: 'https://gateway.partner.org',
      walletAddress: '0x1234567890123456789012345678901234567890',
      agreementId: 'AGR-2026-001',
    });
  });

  test('generates consumer invite token when the administrator selects consumer', async () => {
    const user = userEvent.setup();
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ isPlatformAdmin: true }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ records: [] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          token: 'mock-consumer-token',
          expiresAt: '2026-06-13T10:00:00.000Z',
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ records: [] }),
      });

    render(<InviteTokenPage />);

    await screen.findByRole('button', { name: /generate/i });
    await user.selectOptions(screen.getByLabelText(/registration type/i), 'consumer');
    await user.type(screen.getByLabelText(/consumer name/i), 'Consumer University');
    await user.type(screen.getByLabelText(/consumer organization/i), 'consumer.edu');
    await user.type(screen.getByLabelText(/public base url/i), 'https://gateway.consumer.edu');
    await user.type(screen.getByLabelText(/institutional wallet address/i), '0x1234567890123456789012345678901234567890');
    await user.click(screen.getByRole('button', { name: /generate/i }));

    const trustReview = screen.getByRole('dialog', { name: /review institutional trust/i });
    await user.click(within(trustReview).getByRole('checkbox', { name: /I have verified/i }));
    await user.click(within(trustReview).getByRole('button', { name: /generate provisioning token/i }));

    await waitFor(() => {
      expect(screen.getByDisplayValue('mock-consumer-token')).toBeInTheDocument();
    });

    const provisionRequest = global.fetch.mock.calls.find(([url]) => url === '/api/admin/institutions/provisionProvider');
    expect(JSON.parse(provisionRequest[1].body)).toMatchObject({
      registrationType: 'consumer',
      consumerName: 'Consumer University',
      providerOrganization: 'consumer.edu',
      publicBaseUrl: 'https://gateway.consumer.edu',
      walletAddress: '0x1234567890123456789012345678901234567890',
    });
    expect(JSON.parse(provisionRequest[1].body)).not.toHaveProperty('providerEmail');
    expect(JSON.parse(provisionRequest[1].body)).not.toHaveProperty('providerCountry');
  });

  test('shows durable provisioning status to platform admins without exposing a token', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ isPlatformAdmin: true }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          records: [{
            id: 'provisioning-1',
            institutionId: 'partner.edu',
            walletAddress: '0x1234567890123456789012345678901234567890',
            canonicalBackendOrigin: 'https://gateway.partner.edu',
            registrationType: 'provider',
            stage: 'ACTIVE',
            status: 'ACTIVE',
            tokenConsumed: true,
            txHashes: ['0xabc'],
            suspended: false,
          }],
        }),
      })

    render(<InviteTokenPage />)

    expect(await screen.findByRole('heading', { name: /provision institution/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /provisioning status/i })).toBeInTheDocument()
    expect(screen.getByText('partner.edu')).toBeInTheDocument()
    expect(screen.getByText(/token consumed/i)).toBeInTheDocument()
    expect(screen.getByText(/backend registered/i)).toBeInTheDocument()
    expect(screen.getByText('0xabc')).toBeInTheDocument()
    expect(screen.queryByText('mock-invite-token')).not.toBeInTheDocument()
  })

  test('requires confirmation before suspending an institutional backend', async () => {
    const record = {
      id: 'provisioning-1',
      institutionId: 'partner.edu',
      registrationType: 'provider',
      status: 'ACTIVE',
      stage: 'ACTIVE',
      tokenConsumed: true,
      backendRegistered: true,
      suspended: false,
    }
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ isPlatformAdmin: true }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ records: [record] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ records: [{ ...record, suspended: true }] }) })

    const user = userEvent.setup()
    render(<InviteTokenPage />)

    await user.click(await screen.findByRole('button', { name: 'Suspend backend' }))
    const dialog = screen.getByRole('dialog', { name: /suspend institutional backend/i })
    expect(within(dialog).getByText(/immediately blocks marketplace discovery/i)).toBeInTheDocument()

    await user.click(within(dialog).getByRole('button', { name: 'Suspend backend' }))

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/admin/institutions/backend-revocation',
        expect.objectContaining({ method: 'POST', credentials: 'include' })
      )
    })
    const suspendRequest = global.fetch.mock.calls.find(([url]) => url === '/api/admin/institutions/backend-revocation')
    expect(JSON.parse(suspendRequest[1].body)).toEqual({ institutionId: 'partner.edu', ttlSeconds: 3600 })
    expect(await screen.findByText('Suspended')).toBeInTheDocument()
  })
});
