import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import InstitutionInviteCard from '@/components/dashboard/user/InstitutionInviteCard';

const mockAddTemporaryNotification = jest.fn();

let mockUserState = {
  isSSO: true,
  user: {
    role: 'staff',
    scopedRole: 'staff@uned.es',
    affiliation: 'uned.es',
    organizationName: 'UNED',
  },
};

jest.mock('@/context/UserContext', () => ({
  useUser: () => mockUserState,
}));

jest.mock('@/context/NotificationContext', () => ({
  useNotifications: () => ({
    addTemporaryNotification: mockAddTemporaryNotification,
  }),
}));

describe('InstitutionInviteCard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUserState = {
      isSSO: true,
      user: {
        role: 'staff',
        scopedRole: 'staff@uned.es',
        affiliation: 'uned.es',
        organizationName: 'UNED',
      },
    };
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        pairingId: 'pairing-1',
        challenge: `0x${'11'.repeat(32)}`,
        pairingExpiresAt: '2025-01-01T00:00:00.000Z',
        tokenExpiresAt: '2025-01-01T00:05:00.000Z',
        status: 'AWAITING_BACKEND',
        institutionId: 'uned.es',
        registrationType: 'provider',
      }),
    });
  });

  test('generates a pairing challenge without asking the browser for wallet or backend', async () => {
    const user = userEvent.setup();

    render(<InstitutionInviteCard />);

    await user.click(screen.getByRole('button', { name: /Generate pairing challenge/i }));

    await waitFor(() => expect(global.fetch).toHaveBeenCalled());

    const body = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(body).toEqual({ registrationType: 'provider' });
    expect(screen.getByText(new RegExp(`0x${'11'.repeat(32)}`))).toBeInTheDocument();
    expect(screen.queryByLabelText(/Institutional wallet address/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Public base URL/i)).not.toBeInTheDocument();
    expect(screen.getByText(/Pairing expires/i)).toBeInTheDocument();
    expect(screen.queryByText(/Token expires/i)).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(/Waiting for the backend offer/i);
  });

  test('shows an accessible progress state while creating the pairing challenge', async () => {
    const user = userEvent.setup();
    let resolveCreate;
    global.fetch = jest.fn().mockReturnValueOnce(new Promise((resolve) => {
      resolveCreate = resolve;
    }));

    render(<InstitutionInviteCard />);

    const generateButton = screen.getByRole('button', { name: /Generate pairing challenge/i });
    await user.click(generateButton);

    expect(screen.getByRole('status')).toHaveTextContent(/Creating pairing challenge/i);
    expect(generateButton).toBeDisabled();
    expect(generateButton).toHaveAttribute('aria-busy', 'true');

    resolveCreate({
      ok: true,
      json: async () => ({
        pairingId: 'pairing-1',
        challenge: `0x${'11'.repeat(32)}`,
        pairingExpiresAt: '2025-01-01T00:00:00.000Z',
        status: 'APPROVED',
      }),
    });

    await waitFor(() => expect(screen.getByDisplayValue(`0x${'11'.repeat(32)}`)).toBeInTheDocument());
  });

  test('shows approval progress and instructs the user to complete pairing in the backend', async () => {
    const user = userEvent.setup();
    let resolveApproval;
    const awaitingApproval = {
      pairingId: 'pairing-1',
      challenge: `0x${'11'.repeat(32)}`,
      pairingExpiresAt: '2025-01-01T00:00:00.000Z',
      status: 'AWAITING_APPROVAL',
      walletAddress: '0x1111111111111111111111111111111111111111',
      canonicalBackendOrigin: 'https://gateway.example.test',
    };
    global.fetch = jest.fn((url, options = {}) => {
      if (url.includes('/approve')) {
        return new Promise((resolve) => {
          resolveApproval = resolve;
        });
      }
      return Promise.resolve({ ok: true, json: async () => awaitingApproval });
    });

    render(<InstitutionInviteCard />);
    await user.click(screen.getByRole('button', { name: /Generate pairing challenge/i }));
    const approveButton = await screen.findByRole('button', { name: /Approve pairing/i });
    await user.click(approveButton);

    expect(screen.getByRole('status')).toHaveTextContent(/Approving pairing/i);
    expect(approveButton).toBeDisabled();
    expect(approveButton).toHaveAttribute('aria-busy', 'true');

    resolveApproval({
      ok: true,
      json: async () => ({ ...awaitingApproval, status: 'APPROVED' }),
    });

    await waitFor(() => expect(screen.getByText(/complete pairing in the institutional backend/i)).toBeInTheDocument());
    expect(screen.queryByText(/issue token/i)).not.toBeInTheDocument();
  });

  test('offers an explicit cancellation action for an active pairing', async () => {
    const user = userEvent.setup();

    render(<InstitutionInviteCard />);
    await user.click(screen.getByRole('button', { name: /Generate pairing challenge/i }));
    await waitFor(() => expect(screen.getByRole('button', { name: /Cancel pairing/i })).toBeInTheDocument());

    let resolveCancel;
    global.fetch.mockReturnValueOnce(new Promise((resolve) => {
      resolveCancel = resolve;
    }));
    await user.click(screen.getByRole('button', { name: /Cancel pairing/i }));

    expect(screen.getByRole('status')).toHaveTextContent(/Cancelling pairing/i);

    resolveCancel({ ok: true, status: 204, json: async () => ({}) });

    expect(global.fetch).toHaveBeenLastCalledWith('/api/institutions/provisioning/pairings/pairing-1', expect.objectContaining({
      method: 'DELETE',
    }));
    await waitFor(() => {
      expect(screen.queryByDisplayValue(`0x${'11'.repeat(32)}`)).not.toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /Generate pairing challenge/i })).toBeInTheDocument();
  });

  test('does not render for non-admin SSO users', () => {
    mockUserState = {
      isSSO: true,
      user: {
        role: 'student',
        scopedRole: 'student@uned.es',
        affiliation: 'uned.es',
        organizationName: 'UNED',
      },
    };

    const { container } = render(<InstitutionInviteCard />);

    expect(container).toBeEmptyDOMElement();
  });

  test('does not render for non-SSO users', () => {
    mockUserState = {
      isSSO: false,
      user: {
        role: 'staff',
        scopedRole: 'staff@uned.es',
        affiliation: 'uned.es',
        organizationName: 'UNED',
      },
    };

    const { container } = render(<InstitutionInviteCard />);

    expect(container).toBeEmptyDOMElement();
  });
});
