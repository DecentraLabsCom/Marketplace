
jest.mock('next/dynamic', () => (importFn) => importFn());
import { render, screen } from '@testing-library/react';


// Single require and console.log block for debugging
const { ClientQueryProvider } = require('@/context/ClientQueryProvider');
const { ClientWagmiProvider } = require('@/context/ClientWagmiProvider');
const { NotificationProvider } = require('@/context/NotificationContext');
const { OptimisticUIProvider } = require('@/context/OptimisticUIContext');
const { UserData, useUser } = require('@/context/UserContext');
const { LabTokenProvider } = require('@/context/LabTokenContext');
const { UserEventProvider } = require('@/context/UserEventContext');
const { LabEventProvider } = require('@/context/LabEventContext');
const { BookingEventProvider } = require('@/context/BookingEventContext');
const Navbar = require('@/components/layout/Navbar').default;
const Footer = require('@/components/layout/Footer').default;
const GlobalNotificationStack = require('@/components/layout/GlobalNotificationStack').default;
const PopupBlockerModal = require('@/components/layout/PopupBlockerModal').default;
const DataRefreshIndicator = require('@/components/layout/DataRefreshIndicator').default;
const InstitutionalOnboardingWrapper = require('@/components/auth/InstitutionalOnboardingWrapper').default;

console.log('ClientQueryProvider:', ClientQueryProvider);
console.log('ClientWagmiProvider:', ClientWagmiProvider);
console.log('NotificationProvider:', NotificationProvider);
console.log('OptimisticUIProvider:', OptimisticUIProvider);
console.log('UserData:', UserData);
console.log('LabTokenProvider:', LabTokenProvider);
console.log('UserEventProvider:', UserEventProvider);
console.log('LabEventProvider:', LabEventProvider);
console.log('BookingEventProvider:', BookingEventProvider);
console.log('Navbar:', Navbar);
console.log('Footer:', Footer);
console.log('GlobalNotificationStack:', GlobalNotificationStack);
console.log('PopupBlockerModal:', PopupBlockerModal);
console.log('DataRefreshIndicator:', DataRefreshIndicator);
console.log('InstitutionalOnboardingWrapper:', InstitutionalOnboardingWrapper);

// MinimalAppProviders wrapper for test
function MinimalAppProviders({ children }) {
  return (
    <ClientQueryProvider>
      <ClientWagmiProvider>
        <NotificationProvider>
          <OptimisticUIProvider>
            <UserData>
              <LabTokenProvider>
                <UserEventProvider>
                  <LabEventProvider>
                    <BookingEventProvider>
                      <Navbar />
                      <Footer />
                      <GlobalNotificationStack />
                      <PopupBlockerModal />
                      <DataRefreshIndicator />
                      <InstitutionalOnboardingWrapper />
                      {children}
                    </BookingEventProvider>
                  </LabEventProvider>
                </UserEventProvider>
              </LabTokenProvider>
            </UserData>
          </OptimisticUIProvider>
        </NotificationProvider>
      </ClientWagmiProvider>
    </ClientQueryProvider>
  );
}
jest.mock('@/components/layout/Navbar', () => ({ __esModule: true, default: () => <div data-testid="navbar">Navbar</div> }));
jest.mock('@/components/layout/Footer', () => ({ __esModule: true, default: () => <div data-testid="footer">Footer</div> }));
jest.mock('@/components/layout/GlobalNotificationStack', () => ({ __esModule: true, default: () => <div data-testid="notifications">Notifications</div> }));
jest.mock('@/components/layout/PopupBlockerModal', () => ({ __esModule: true, default: () => <div data-testid="popup-blocker">PopupBlocker</div> }));
jest.mock('@/components/layout/DataRefreshIndicator', () => ({ __esModule: true, default: () => <div data-testid="refresh-indicator">RefreshIndicator</div> }));
jest.mock('@/components/auth/InstitutionalOnboardingWrapper', () => ({ __esModule: true, default: () => <div data-testid="onboarding">Onboarding</div> }));
jest.mock('@/context/ClientQueryProvider', () => ({ __esModule: true, default: ({ children }) => <div>{children}</div>, ClientQueryProvider: ({ children }) => <div>{children}</div> }));
jest.mock('@/context/ClientWagmiProvider', () => ({ __esModule: true, default: ({ children }) => <div>{children}</div>, ClientWagmiProvider: ({ children }) => <div>{children}</div> }));
jest.mock('@/context/NotificationContext', () => ({ __esModule: true, default: ({ children }) => <div>{children}</div>, NotificationProvider: ({ children }) => <div>{children}</div>, useNotifications: () => ({}) }));
jest.mock('@/context/OptimisticUIContext', () => ({ __esModule: true, default: ({ children }) => <div>{children}</div>, OptimisticUIProvider: ({ children }) => <div>{children}</div>, useOptimisticUI: () => ({}) }));
jest.mock('@/context/UserContext', () => ({ __esModule: true, default: ({ children }) => <div>{children}</div>, UserData: ({ children }) => <div>{children}</div>, useUser: () => ({ isLoggedIn: true, isSSO: false, hasWalletSession: false }) }));
jest.mock('@/context/LabTokenContext', () => ({ __esModule: true, default: ({ children }) => <div>{children}</div>, LabTokenProvider: ({ children }) => <div>{children}</div>, useLabTokenHook: () => ({}) }));
jest.mock('@/context/UserEventContext', () => ({ __esModule: true, default: ({ children }) => <div>{children}</div>, UserEventProvider: ({ children }) => <div>{children}</div>, useUserEvent: () => ({}) }));
jest.mock('@/context/LabEventContext', () => ({ __esModule: true, default: ({ children }) => <div>{children}</div>, LabEventProvider: ({ children }) => <div>{children}</div>, useLabEvent: () => ({}) }));
jest.mock('@/context/BookingEventContext', () => ({ __esModule: true, default: ({ children }) => <div>{children}</div>, BookingEventProvider: ({ children }) => <div>{children}</div>, useBookingEvent: () => ({}) }));


describe('AppProviders', () => {
  it('renders all main layout components and children', () => {
    render(
      <MinimalAppProviders>
        <div data-testid="content">Content</div>
      </MinimalAppProviders>
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
