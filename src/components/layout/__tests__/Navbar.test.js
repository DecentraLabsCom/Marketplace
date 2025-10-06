/**
 * Test suite for the main navigation bar component
 * 
 * This test file validates the Navbar component's behavior across different
 * authentication states, user roles, and responsive breakpoints. It ensures
 * proper menu visibility, role-based access control, and mobile menu functionality.
 * 
 * Test Coverage:
 * - Authentication states (logged in/out)
 * - User roles (wallet users, SSO users, faculty, providers)
 * - Provider registration visibility logic
 * - Mobile menu toggle functionality
 * - Loading states handling
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import Navbar from '../Navbar';
import { useUser } from '@/context/UserContext';
import { validateProviderRole } from '@/utils/auth/roleValidation';

// Mock external dependencies to isolate component behavior
jest.mock('next/link', () => {
  // Replace Next.js Link with plain anchor for testing
  return ({ children, href }) => <a href={href}>{children}</a>;
});

jest.mock('next/image', () => {
  // Simplify Next.js Image to standard img element
  return ({ src, alt }) => <img src={src} alt={alt} />;
});

jest.mock('@/context/UserContext');
jest.mock('@/utils/auth/roleValidation');
jest.mock('@/components/auth/Login', () => () => <div>Login</div>);
jest.mock('@/components/ui', () => ({
  Container: ({ children }) => <div>{children}</div>,
}));

describe('Navbar', () => {
  beforeEach(() => {
    // Reset all mocks before each test to ensure test isolation
    jest.clearAllMocks();
    // Default validation result - most users don't have provider privileges
    validateProviderRole.mockReturnValue({ isValid: false });
  });

  /**
   * Tests for unauthenticated users
   * Verifies minimal UI is shown when no user is logged in
   */
  describe('when user is logged out', () => {
    beforeEach(() => {
      useUser.mockReturnValue({
        isLoggedIn: false,
        isProvider: false,
        isProviderLoading: false,
        isSSO: false,
        user: null,
      });
    });

    it('renders logo and login', () => {
      render(<Navbar />);
      
      // Essential elements should always be visible
      expect(screen.getByAltText('DecentraLabs Logo')).toBeInTheDocument();
      expect(screen.getByText('Login')).toBeInTheDocument();
    });

    it('does not show navigation menu', () => {
      render(<Navbar />);
      
      // Protected routes should not be accessible without authentication
      expect(screen.queryByText('Book a Lab')).not.toBeInTheDocument();
      expect(screen.queryByText('Dashboard')).not.toBeInTheDocument();
    });
  });

  /**
   * Tests for authenticated regular users
   * Validates standard navigation options for wallet-based users
   */
  describe('when user is logged in', () => {
    beforeEach(() => {
      useUser.mockReturnValue({
        isLoggedIn: true,
        isProvider: false,
        isProviderLoading: false,
        isSSO: false,
        user: { id: '1', role: 'user' },
      });
    });

    it('shows basic navigation options', () => {
      render(<Navbar />);
      
      // Core navigation should be available to all authenticated users
      expect(screen.getByText('Book a Lab')).toBeInTheDocument();
      expect(screen.getByText('Dashboard')).toBeInTheDocument();
    });

    it('shows register as provider option for wallet users', () => {
      render(<Navbar />);
      
      // Wallet users can self-register as providers
      expect(screen.getByText('Register as a Provider')).toBeInTheDocument();
    });

    it('links navigate to correct pages', () => {
      render(<Navbar />);
      
      // Verify routing configuration
      expect(screen.getByText('Book a Lab')).toHaveAttribute('href', '/reservation');
      expect(screen.getByText('Dashboard')).toHaveAttribute('href', '/userdashboard');
    });
  });

  /**
   * Tests for provider users
   * Ensures providers have access to lab management panel
   */
  describe('when user is a provider', () => {
    beforeEach(() => {
      useUser.mockReturnValue({
        isLoggedIn: true,
        isProvider: true,
        isProviderLoading: false,
        isSSO: false,
        user: { id: '1', role: 'provider' },
      });
    });

    it('shows lab panel instead of register', () => {
      render(<Navbar />);
      
      // Providers see management panel, not registration
      expect(screen.getByText('Lab Panel')).toBeInTheDocument();
      expect(screen.queryByText('Register as a Provider')).not.toBeInTheDocument();
    });
  });

  /**
   * Tests for faculty members
   * Faculty get automatic provider access without registration
   */
  describe('when user is faculty', () => {
    beforeEach(() => {
      useUser.mockReturnValue({
        isLoggedIn: true,
        isProvider: false,
        isProviderLoading: false,
        isSSO: true,
        user: { id: '1', role: 'faculty' },
      });
    });

    it('shows lab panel without provider registration', () => {
      render(<Navbar />);
      
      // Faculty bypass provider registration requirement
      expect(screen.getByText('Lab Panel')).toBeInTheDocument();
      expect(screen.queryByText('Register as a Provider')).not.toBeInTheDocument();
    });
  });

  /**
   * Tests for SSO user role validation
   * SSO users need specific roles to register as providers
   */
  describe('SSO user registration visibility', () => {
    it('shows register when SSO user has valid role', () => {
      // Staff members can register as providers
      validateProviderRole.mockReturnValue({ isValid: true });
      useUser.mockReturnValue({
        isLoggedIn: true,
        isProvider: false,
        isProviderLoading: false,
        isSSO: true,
        user: { id: '1', role: 'staff', scopedRole: '' },
      });

      render(<Navbar />);
      
      expect(screen.getByText('Register as a Provider')).toBeInTheDocument();
    });

    it('hides register when SSO user has invalid role', () => {
      // Students cannot register as providers
      validateProviderRole.mockReturnValue({ isValid: false });
      useUser.mockReturnValue({
        isLoggedIn: true,
        isProvider: false,
        isProviderLoading: false,
        isSSO: true,
        user: { id: '1', role: 'student', scopedRole: '' },
      });

      render(<Navbar />);
      
      expect(screen.queryByText('Register as a Provider')).not.toBeInTheDocument();
    });
  });

  /**
   * Tests for mobile menu functionality
   * Validates responsive menu toggle behavior
   */
  describe('mobile menu', () => {
    beforeEach(() => {
      useUser.mockReturnValue({
        isLoggedIn: true,
        isProvider: false,
        isProviderLoading: false,
        isSSO: false,
        user: { id: '1' },
      });
    });

    it('toggles menu visibility on button click', () => {
      render(<Navbar />);
      
      // Find mobile menu hamburger button
      const menuButton = screen.getByRole('button');
      
      // Desktop menu is always rendered (hidden via CSS on mobile)
      expect(screen.getAllByText('Book a Lab')).toHaveLength(1);
      
      // Open mobile menu - creates duplicate menu items
      fireEvent.click(menuButton);
      expect(screen.getAllByText('Book a Lab')).toHaveLength(2);
      
      // Close mobile menu - removes duplicate items
      fireEvent.click(menuButton);
      expect(screen.getAllByText('Book a Lab')).toHaveLength(1);
    });
  });

  /**
   * Tests for loading state handling
   * Ensures UI remains stable during async operations
   */
  describe('loading states', () => {
    it('shows menu even when provider status is loading', () => {
      useUser.mockReturnValue({
        isLoggedIn: true,
        isProvider: false,
        isProviderLoading: true,
        isSSO: false,
        user: { id: '1' },
      });

      render(<Navbar />);
      
      // Basic navigation remains available during loading
      expect(screen.getByText('Book a Lab')).toBeInTheDocument();
      expect(screen.getByText('Dashboard')).toBeInTheDocument();
    });

    it('hides register button when provider loading', () => {
      useUser.mockReturnValue({
        isLoggedIn: true,
        isProvider: false,
        isProviderLoading: true,
        isSSO: false,
        user: { id: '1' },
      });

      render(<Navbar />);
      
      // Prevent registration during provider status verification
      expect(screen.queryByText('Register as a Provider')).not.toBeInTheDocument();
    });
  });
});