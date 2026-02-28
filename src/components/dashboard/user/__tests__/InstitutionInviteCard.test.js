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
    await user.click(
      screen.getByRole('button', { name: /Generate Provisioning Token/i })
    );

    await waitFor(() => expect(global.fetch).toHaveBeenCalled());

    const body = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(body.providerCountry).toBe('ES');
  });

  test('uses manual provider country when entered', async () => {
    const user = userEvent.setup();

    render(<InstitutionInviteCard />);

    await user.type(
      screen.getByLabelText(/Public base URL/i),
      'https://institution.example.edu'
    );
    // The country field may be pre-filled by domain inference (affiliation: 'uned.es' → 'ES').
    // Clear it first so the user's explicit value ('PT') is the only content.
    const countryInput = screen.getByLabelText(/Provider country/i);
    await user.clear(countryInput);
    await user.type(countryInput, 'PT');
    await user.click(
      screen.getByRole('button', { name: /Generate Provisioning Token/i })
    );

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
