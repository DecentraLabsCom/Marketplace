jest.mock('@/components/layout/ClientOnly', () => ({ __esModule: true, default: ({ children }) => <>{children}</> }));
jest.mock('next/dynamic', () => (importFn) => {
  // Inspect the import function's toString to determine the import path
  const importStr = importFn.toString();
  if (importStr.includes('GlobalNotificationStack')) {
    return () => <div data-testid="notifications" />;
  }
  if (importStr.includes('PopupBlockerModal')) {
    return () => <div data-testid="popup-blocker" />;
  }
  if (importStr.includes('DataRefreshIndicator')) {
    return () => <div data-testid="refresh-indicator" />;
  }
  if (importStr.includes('InstitutionalOnboardingWrapper')) {
    return () => <div data-testid="onboarding" />;
  }
  return () => <div data-testid="dynamic-component" />;
});
jest.mock('@/components/layout/GlobalNotificationStack', () => ({ __esModule: true, default: () => <div data-testid="notifications" /> }));
jest.mock('@/components/layout/PopupBlockerModal', () => ({ __esModule: true, default: () => <div data-testid="popup-blocker" /> }));
jest.mock('@/components/layout/DataRefreshIndicator', () => ({ __esModule: true, default: () => <div data-testid="refresh-indicator" /> }));
jest.mock('@/components/auth/InstitutionalOnboardingWrapper', () => ({ __esModule: true, default: () => <div data-testid="onboarding" /> }));
import { render, screen } from '@testing-library/react';


import AppProviders from '../AppProviders';
// Patch dynamic import variables to use the correct mocks
import notificationsMock from '@/components/layout/GlobalNotificationStack';
import popupBlockerMock from '@/components/layout/PopupBlockerModal';
import refreshIndicatorMock from '@/components/layout/DataRefreshIndicator';
import onboardingMock from '@/components/auth/InstitutionalOnboardingWrapper';

// Patch the variables in the test scope
global.GlobalNotificationStack = notificationsMock.default;
global.PopupBlockerModal = popupBlockerMock.default;
global.DataRefreshIndicator = refreshIndicatorMock.default;
global.InstitutionalOnboardingWrapper = onboardingMock.default;

jest.mock('@/components/layout/Navbar', () => () => <div data-testid="navbar">Navbar</div>);
jest.mock('@/components/layout/Footer', () => () => <div data-testid="footer">Footer</div>);
jest.mock('@/components/layout/GlobalNotificationStack', () => () => <div data-testid="notifications">Notifications</div>);
jest.mock('@/components/layout/PopupBlockerModal', () => () => <div data-testid="popup-blocker">PopupBlocker</div>);
jest.mock('@/components/layout/DataRefreshIndicator', () => () => <div data-testid="refresh-indicator">RefreshIndicator</div>);
jest.mock('@/components/auth/InstitutionalOnboardingWrapper', () => () => <div data-testid="onboarding">Onboarding</div>);











jest.mock('@/context/ClientQueryProvider', () => ({
  __esModule: true,
  default: function ClientQueryProvider({ children }) { return <>{children}</>; }
}));
jest.mock('@/context/ClientWagmiProvider', () => ({
  __esModule: true,
  default: function ClientWagmiProvider({ children }) { return <>{children}</>; }
}));
jest.mock('@/context/NotificationContext', () => ({
  __esModule: true,
  NotificationProvider: function NotificationProvider({ children }) { return <>{children}</>; }
}));
jest.mock('@/context/OptimisticUIContext', () => ({
  __esModule: true,
  OptimisticUIProvider: function OptimisticUIProvider({ children }) { return <>{children}</>; }
}));
jest.mock('@/context/UserContext', () => ({
  __esModule: true,
  UserData: function UserData({ children }) { return <>{children}</>; },
  useUser: () => ({ isLoggedIn: true, isSSO: false, hasWalletSession: false })
}));
jest.mock('@/context/LabTokenContext', () => ({
  __esModule: true,
  LabTokenProvider: function LabTokenProvider({ children }) { return <>{children}</>; }
}));
jest.mock('@/context/UserEventContext', () => ({
  __esModule: true,
  UserEventProvider: function UserEventProvider({ children }) { return <>{children}</>; }
}));
jest.mock('@/context/LabEventContext', () => ({
  __esModule: true,
  LabEventProvider: function LabEventProvider({ children }) { return <>{children}</>; }
}));
jest.mock('@/context/BookingEventContext', () => ({
  __esModule: true,
  BookingEventProvider: function BookingEventProvider({ children }) { return <>{children}</>; }
}));


describe('AppProviders', () => {
  it('renders all main layout components and children', () => {
    render(
      <AppProviders>
        <div data-testid="content">Content</div>
      </AppProviders>
    );
    expect(screen.getByTestId('navbar')).toBeInTheDocument();
    expect(screen.getByTestId('footer')).toBeInTheDocument();
    expect(screen.getByTestId('notifications')).toBeInTheDocument();
    expect(screen.getByTestId('popup-blocker')).toBeInTheDocument();
    expect(screen.getByTestId('refresh-indicator')).toBeInTheDocument();
    expect(screen.getByTestId('onboarding')).toBeInTheDocument();
    expect(screen.getByTestId('content')).toBeInTheDocument();
  });
});
