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
        expiresAt: '2025-01-01T00:00:00.000Z',
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
