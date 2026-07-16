import { render, screen, waitFor, within } from '@testing-library/react';
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
        token: 'mock-token',
        expiresAt: '2025-01-01T00:00:00.000Z',
        payload: {},
      }),
    });
  });

  test('shows provider country input when no detected country is available', () => {
    render(<InstitutionInviteCard />);

    expect(
      screen.getByText(/Provider country \(ISO, optional\)/i)
    ).toBeInTheDocument();
  });

  test('hides provider country input when detected country is available', () => {
    mockUserState = {
      ...mockUserState,
      user: {
        ...mockUserState.user,
        country: 'ES',
      },
    };

    render(<InstitutionInviteCard />);

    expect(
      screen.queryByText(/Provider country \(ISO, optional\)/i)
    ).not.toBeInTheDocument();
  });

  test('uses detected country when generating provider invite', async () => {
    const user = userEvent.setup();
    mockUserState = {
      ...mockUserState,
      user: {
        ...mockUserState.user,
        country: 'ES',
      },
    };

    render(<InstitutionInviteCard />);

    await user.type(
      screen.getByLabelText(/Public base URL/i),
      'https://institution.example.edu'
    );
    await user.type(
      screen.getByLabelText(/Institutional wallet address/i),
      '0x1234567890123456789012345678901234567890'
    );
    await user.click(
      screen.getByRole('button', { name: /Generate Provisioning Token/i })
    );

    const dialog = screen.getByRole('dialog', { name: /review institutional trust/i })
    expect(within(dialog).getByText('uned.es')).toBeInTheDocument()
    expect(within(dialog).getByText('https://institution.example.edu')).toBeInTheDocument()
    expect(global.fetch).not.toHaveBeenCalled()
    await user.click(within(dialog).getByRole('checkbox', { name: /I have verified/i }))
    await user.click(within(dialog).getByRole('button', { name: /generate provisioning token/i }))

    await waitFor(() => expect(global.fetch).toHaveBeenCalled());

    const body = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(body.providerCountry).toBe('ES');
    expect(body.walletAddress).toBe('0x1234567890123456789012345678901234567890');
  });

  test('uses manual provider country when entered', async () => {
    const user = userEvent.setup();

    render(<InstitutionInviteCard />);

    await user.type(
      screen.getByLabelText(/Public base URL/i),
      'https://institution.example.edu'
    );
    await user.type(
      screen.getByLabelText(/Institutional wallet address/i),
      '0x1234567890123456789012345678901234567890'
    );
    // The country field may be pre-filled by domain inference (affiliation: 'uned.es' → 'ES').
    // Clear it first so the user's explicit value ('PT') is the only content.
    const countryInput = screen.getByLabelText(/Provider country/i);
    await user.clear(countryInput);
    await user.type(countryInput, 'PT');
    await user.click(
      screen.getByRole('button', { name: /Generate Provisioning Token/i })
    );

    const dialog = screen.getByRole('dialog', { name: /review institutional trust/i })
    await user.click(within(dialog).getByRole('checkbox', { name: /I have verified/i }))
    await user.click(within(dialog).getByRole('button', { name: /generate provisioning token/i }))

    await waitFor(() => expect(global.fetch).toHaveBeenCalled());

    const body = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(body.providerCountry).toBe('PT');
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

  test('requires an institutional wallet address before token generation', async () => {
    const user = userEvent.setup();
    render(<InstitutionInviteCard />);

    await user.type(
      screen.getByLabelText(/Public base URL/i),
      'https://institution.example.edu'
    );
    await user.click(
      screen.getByRole('button', { name: /Generate Provisioning Token/i })
    );

    expect(global.fetch).not.toHaveBeenCalled();
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
