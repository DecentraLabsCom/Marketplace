import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import InviteTokenPage from '../InviteTokenPage';

jest.mock('@/components/ui', () => ({
  Container: ({ children, className }) => <div className={className}>{children}</div>,
}));

describe('InviteTokenPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Object.assign(navigator, {
      clipboard: {
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
        json: async () => ({
          success: true,
          token: 'mock-invite-token',
          expiresAt: '2026-06-13T10:00:00.000Z',
        }),
      });

    render(<InviteTokenPage />);

    await screen.findByRole('button', { name: /generate/i });
    await user.type(screen.getByLabelText(/provider name/i), 'Partner Lab');
    await user.type(screen.getByLabelText(/provider email/i), 'admin@partner.org');
    await user.type(screen.getByLabelText(/provider organization/i), 'partner.org');
    await user.clear(screen.getByLabelText(/provider country/i));
    await user.type(screen.getByLabelText(/provider country/i), 'PT');
    await user.type(screen.getByLabelText(/public base url/i), 'https://gateway.partner.org');
    await user.type(screen.getByLabelText(/agreement id/i), 'AGR-2026-001');
    await user.click(screen.getByRole('button', { name: /generate/i }));

    await waitFor(() => {
      expect(screen.getByDisplayValue('mock-invite-token')).toBeInTheDocument();
    });

    expect(global.fetch).toHaveBeenLastCalledWith(
      '/api/admin/institutions/provisionProvider',
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
      })
    );
    const body = JSON.parse(global.fetch.mock.calls[1][1].body);
    expect(body).toMatchObject({
      providerName: 'Partner Lab',
      providerEmail: 'admin@partner.org',
      providerCountry: 'PT',
      providerOrganization: 'partner.org',
      publicBaseUrl: 'https://gateway.partner.org',
      agreementId: 'AGR-2026-001',
    });
  });
});
