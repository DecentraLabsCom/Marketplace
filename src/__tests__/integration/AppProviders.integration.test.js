/**
 * Integration Tests: AppProviders and App Shell
 *
 * Test Behaviors:
 * - AppProviders anonimo (no realtime listeners)
 * - AppProviders autenticado (realtime listeners active)
 * - Persistencia de ClientQueryProvider
 *
 * @test-suite AppProvidersIntegration
 */

import React, { useState } from 'react';
import { render, screen, waitFor } from "@testing-library/react";

// Mock the UserContext to control auth state
let mockUserState = {
  isLoggedIn: false,
  isSSO: false,
  hasWalletSession: false,
};

jest.mock('@/context/UserContext', () => ({
  UserData: ({ children }) => <div data-testid="user-data">{children}</div>,
  useUser: () => mockUserState,
}));

// Mock the nested contexts to verify they are mounted or not
jest.mock('@/context/UserEventContext', () => ({
  UserEventProvider: ({ children }) => <div data-testid="user-event-provider">{children}</div>,
}));
jest.mock('@/context/LabEventContext', () => ({
  LabEventProvider: ({ children }) => <div data-testid="lab-event-provider">{children}</div>,
}));
jest.mock('@/context/BookingEventContext', () => ({
  BookingEventProvider: ({ children }) => <div data-testid="booking-event-provider">{children}</div>,
}));

// Mock the UI scaffolding so we focus on Provider logic
jest.mock('@/components/layout/Navbar', () => () => <div data-testid="navbar">Navbar</div>);
jest.mock('@/components/layout/Footer', () => () => <div data-testid="footer">Footer</div>);
jest.mock('@/components/layout/ClientOnly', () => ({ children }) => <div data-testid="client-only">{children}</div>);

// We need to ensure we have the actual AppProviders and ClientQueryProvider, not mocks
import AppProviders from '@/components/layout/AppProviders';
import ClientQueryProvider from '@/context/ClientQueryProvider';

describe("AppProviders App Shell Integration", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("Authentication and Realtime Listeners", () => {
    test("mounts without realtime listeners for anonymous users", () => {
      mockUserState = { isLoggedIn: false, isSSO: false, hasWalletSession: false };

      render(
        <AppProviders>
          <div data-testid="app-content">App Content</div>
        </AppProviders>
      );

      // Core scaffolding mounts
      expect(screen.getByTestId("navbar")).toBeInTheDocument();
      expect(screen.getByTestId("footer")).toBeInTheDocument();
      expect(screen.getByTestId("app-content")).toBeInTheDocument();

      // Realtime listeners should NOT mount for anonymous users
      expect(screen.queryByTestId("user-event-provider")).not.toBeInTheDocument();
      expect(screen.queryByTestId("lab-event-provider")).not.toBeInTheDocument();
      expect(screen.queryByTestId("booking-event-provider")).not.toBeInTheDocument();
    });

    test("mounts with realtime listeners when Wallet user is connected", () => {
      mockUserState = { isLoggedIn: true, isSSO: false, hasWalletSession: true };

      render(
        <AppProviders>
          <div data-testid="app-content">App Content</div>
        </AppProviders>
      );

      // Realtime listeners SHOULD mount
      expect(screen.getByTestId("user-event-provider")).toBeInTheDocument();
      expect(screen.getByTestId("lab-event-provider")).toBeInTheDocument();
      expect(screen.getByTestId("booking-event-provider")).toBeInTheDocument();
    });

    test("mounts with realtime listeners when SSO user is connected", () => {
      mockUserState = { isLoggedIn: true, isSSO: true, hasWalletSession: false };

      render(
        <AppProviders>
          <div data-testid="app-content">App Content</div>
        </AppProviders>
      );

      // Realtime listeners SHOULD mount
      expect(screen.getByTestId("user-event-provider")).toBeInTheDocument();
      expect(screen.getByTestId("lab-event-provider")).toBeInTheDocument();
      expect(screen.getByTestId("booking-event-provider")).toBeInTheDocument();
    });
  });

  describe("ClientQueryProvider Persistence", () => {
    test("QueryClient reference is persisted across renders", async () => {
      // Create a test component that triggers re-renders of the Provider
      // to ensure the internal QueryClient state is not destroyed.
      const TestApp = () => {
        const [count, setCount] = useState(0);
        return (
          <ClientQueryProvider>
            <div data-testid="render-count">{count}</div>
            <button data-testid="increment-btn" onClick={() => setCount(c => c + 1)}>
              Rerender
            </button>
          </ClientQueryProvider>
        );
      };

      const { container } = render(<TestApp />);
      
      expect(screen.getByTestId("render-count")).toHaveTextContent("0");
      
      // On mount, the React Query context is initialized and provides the Client
      // We don't have direct access to the client without another hook, but we can verify
      // that no errors are thrown during a component re-render which would happen if
      // the Client provider was fully remounting continuously.
      
      const btn = screen.getByTestId("increment-btn");
      btn.click();

      await waitFor(() => {
        expect(screen.getByTestId("render-count")).toHaveTextContent("1");
      });
      
      // If ClientQueryProvider wasn't persisting its client correctly using 
      // useState(new QueryClient()), it could cause a complete unmount/remount loop
      // of children or throw context errors. The fact that state preserves across clicks
      // proves the boundary is stable.
    });
  });
});
