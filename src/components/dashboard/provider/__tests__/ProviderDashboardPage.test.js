/**
 * Unit tests for ProviderDashboard component
 *
 * Tested behaviors:
 * - Access control: redirects for non-providers; no redirect while loading
 * - Successful render: main dashboard sections render for authenticated providers
 * - Error states: error UI and retry action when labs query fails
 * - Edge cases: empty labs list and labs missing id fields rendered safely
 *
 */

import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';

// Navigation state
const mockPush = jest.fn();

// User authentication state
let mockUserData = {
  address: '0xABC',
  user: { name: 'Alice', email: 'alice@example.com' },
  isSSO: false,
  isProvider: true,
  isProviderLoading: false,
  isLoading: false
};

// Lab query response structure
let mockLabsData = {
  data: { labs: [] },
  isLoading: false,
  isError: false,
  error: null
};

// External dependencies
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush })
}));

jest.mock('viem', () => ({
  parseUnits: jest.fn((value) => BigInt(Math.floor(parseFloat(value) * 1e18)))
}));

// Context providers
jest.mock('@/context/UserContext', () => ({
  useUser: () => mockUserData
}));

jest.mock('@/context/NotificationContext', () => ({
  useNotifications: () => ({
    addTemporaryNotification: jest.fn(),
    addPersistentNotification: jest.fn()
  })
}));

jest.mock('@/context/LabTokenContext', () => ({
  useLabToken: () => ({ decimals: 18 })
}));

// Data fetching hooks
jest.mock('@/hooks/lab/useLabs', () => ({
  useLabsForProvider: () => mockLabsData,
  useAddLab: () => ({ mutateAsync: jest.fn() }),
  useUpdateLab: () => ({ mutate: jest.fn() }),
  useDeleteLab: () => ({ mutateAsync: jest.fn() }),
  useListLab: () => ({ mutateAsync: jest.fn() }),
  useUnlistLab: () => ({ mutateAsync: jest.fn() })
}));

jest.mock('@/hooks/booking/useBookings', () => ({
  useLabBookingsDashboard: () => ({ data: { bookings: [] }, isError: false }),
  useRequestFunds: () => ({ mutateAsync: jest.fn() })
}));

jest.mock('@/hooks/provider/useProvider', () => ({
  useSaveLabData: () => ({ mutateAsync: jest.fn() }),
  useDeleteLabData: () => ({ mutateAsync: jest.fn() }),
  useMoveFiles: () => ({ mutateAsync: jest.fn() })
}));

// UI components
jest.mock('@/components/ui', () => ({
  Container: ({ children }) => <div>{children}</div>
}));

jest.mock('@/components/auth/AccessControl', () => ({
  __esModule: true,
  default: ({ children }) => <div>{children}</div>
}));

jest.mock('@/components/dashboard/user/DashboardHeader', () => ({
  __esModule: true,
  default: ({ title }) => <h1>{title}</h1>
}));

jest.mock('@/components/dashboard/provider/ProviderLabsList', () => ({
  __esModule: true,
  default: ({ ownedLabs }) => (
    <div data-testid="labs-list">
      {ownedLabs && ownedLabs.length > 0 ? (
        ownedLabs.map((lab, index) => (
          <div key={lab.id || index}>
            <span>{lab.name}</span>
          </div>
        ))
      ) : null}
    </div>
  )
}));

jest.mock('@/components/dashboard/provider/ReservationsCalendar', () => ({
  __esModule: true,
  default: () => <div data-testid="calendar">Calendar</div>
}));

jest.mock('@/components/dashboard/provider/ProviderActions', () => ({
  __esModule: true,
  default: () => <div data-testid="actions">Actions</div>
}));

jest.mock('@/components/dashboard/provider/LabModal', () => ({
  __esModule: true,
  default: () => null
}));

jest.mock('@/utils/dev/logger', () => ({
  __esModule: true,
  default: { log: jest.fn(), error: jest.fn() }
}));

import ProviderDashboard from '@/components/dashboard/provider/ProviderDashboardPage';

describe('ProviderDashboard - Unit Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPush.mockClear();
    
    // Reset to authenticated provider state
    mockUserData = {
      address: '0xABC',
      user: { name: 'Alice', email: 'alice@example.com' },
      isSSO: false,
      isProvider: true,
      isProviderLoading: false,
      isLoading: false
    };

    // Reset to empty labs state
    mockLabsData = {
      data: { labs: [] },
      isLoading: false,
      isError: false,
      error: null
    };
  });

  describe('Access Control', () => {
    test('redirects non-providers to home page', async () => {
      mockUserData.isProvider = false;
      mockUserData.isLoading = false;
      mockUserData.isProviderLoading = false;
      mockUserData.address = '0xABC';

      render(<ProviderDashboard />);

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith('/');
      });
    });

    test('does not redirect while user data is loading', async () => {
      mockUserData.isLoading = true;

      render(<ProviderDashboard />);

      await waitFor(() => {
        expect(mockPush).not.toHaveBeenCalled();
      });
    });

    test('renders dashboard when user is a valid provider', async () => {
      render(<ProviderDashboard />);

      expect(await screen.findByText('Lab Panel')).toBeInTheDocument();
      expect(screen.getByTestId('labs-list')).toBeInTheDocument();
      expect(screen.getByTestId('calendar')).toBeInTheDocument();
      expect(screen.getByTestId('actions')).toBeInTheDocument();
    });
  });

  describe('Error Handling', () => {
    test('displays error screen when labs query fails', async () => {
      mockLabsData = {
        data: null,
        isLoading: false,
        isError: true,
        error: { message: 'Network error' }
      };

      render(<ProviderDashboard />);

      expect(await screen.findByText(/Error Loading Labs/i)).toBeInTheDocument();
      expect(screen.getByText(/Network error/i)).toBeInTheDocument();
    });

    test('shows retry button when error occurs', async () => {
      mockLabsData.isError = true;
      mockLabsData.error = { message: 'Failed to load' };

      render(<ProviderDashboard />);

      const retryButton = await screen.findByRole('button', { name: /retry/i });
      expect(retryButton).toBeInTheDocument();
    });
  });

  describe('Edge Cases', () => {
    test('handles empty labs list without crashing', async () => {
      mockLabsData.data = { labs: [] };

      render(<ProviderDashboard />);

      expect(await screen.findByText('Lab Panel')).toBeInTheDocument();
      expect(screen.getByTestId('labs-list')).toBeInTheDocument();
    });

    test('handles labs without IDs gracefully', async () => {
      mockLabsData.data = {
        labs: [{ name: 'Lab Without ID' }]
      };

      render(<ProviderDashboard />);

      expect(await screen.findByText('Lab Panel')).toBeInTheDocument();
      expect(await screen.findByText('Lab Without ID')).toBeInTheDocument();
    });
  });
});