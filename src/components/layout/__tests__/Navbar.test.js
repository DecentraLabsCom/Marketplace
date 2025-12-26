/**
 * Unit tests the Navigation bar component
 *
 * This test file ensures proper menu visibility, role-based access control,
 * and mobile menu functionality.
 *
 * Test Coverage:
 * - Authentication states (logged in/out)
 * - User roles (wallet users, SSO users, faculty, institutional admins)
 * - Provider registration visibility logic (now uses hasAdminRole)
 * - Mobile menu toggle functionality
 * - Loading states handling
 */

import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";
import Navbar from "../Navbar";
import { useOptionalUser } from "@/context/UserContext";
import { hasAdminRole } from "@/utils/auth/roleValidation";

// Mock external dependencies to isolate component behavior
jest.mock("next/link", () => {
  return ({ children, href }) => <a href={href}>{children}</a>;
});

jest.mock("next/image", () => {
  return ({ src, alt }) => <img src={src} alt={alt} />;
});

jest.mock("@/context/UserContext");
jest.mock("@/utils/auth/roleValidation");
jest.mock("@/components/auth/Login", () => () => <div>Login</div>);
jest.mock("@/components/ui", () => ({
  Container: ({ children }) => <div>{children}</div>,
}));

// Mock hasAdminRole
const mockHasAdminRole = hasAdminRole;

describe("Navbar", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockHasAdminRole.mockReturnValue(false); // default: no admin
  });

  /**
   * Tests for unauthenticated users
   */
  describe("when user is logged out", () => {
    beforeEach(() => {
      useOptionalUser.mockReturnValue({
        isLoggedIn: false,
        isProvider: false,
        isProviderLoading: false,
        isSSO: false,
        user: null,
        isInstitutionRegistered: false,
        isInstitutionRegistrationLoading: false,
      });
    });

    test("renders logo and login", () => {
      render(<Navbar />);
      expect(screen.getByAltText("DecentraLabs Logo")).toBeInTheDocument();
      expect(screen.getByText("Login")).toBeInTheDocument();
    });

    test("does not show navigation menu", () => {
      render(<Navbar />);
      expect(screen.queryByText("Book a Lab")).not.toBeInTheDocument();
    });
  });

  /**
   * Tests for wallet users (non-SSO)
   */
  describe("when user is logged in (wallet user)", () => {
    beforeEach(() => {
      useOptionalUser.mockReturnValue({
        isLoggedIn: true,
        isProvider: false,
        isProviderLoading: false,
        isSSO: false,
        user: { id: "1", role: "user" },
        isInstitutionRegistered: false,
        isInstitutionRegistrationLoading: false,
      });
    });

    test("shows basic navigation and register as provider", () => {
      render(<Navbar />);
      expect(screen.getByText("Book a Lab")).toBeInTheDocument();
      expect(screen.getByText("Dashboard")).toBeInTheDocument();
      expect(screen.getByText("Register as a Provider")).toBeInTheDocument(); // ← wallet users
    });
  });

  /**
   * Tests for SSO users with institutional admin role (staff/faculty/employee)
   */
  describe("SSO user with institutional admin privileges", () => {
    beforeEach(() => {
      useOptionalUser.mockReturnValue({
        isLoggedIn: true,
        isProvider: false,
        isProviderLoading: false,
        isSSO: true,
        user: { id: "1", role: "staff", scopedRole: "" },
        isInstitutionRegistered: false,
        isInstitutionRegistrationLoading: false,
        institutionRegistrationStatus: "unregistered",
      });
      mockHasAdminRole.mockReturnValue(true);
    });

    test('shows "Register my Institution" for institutional admins', () => {
      render(<Navbar />);
      expect(screen.getByText("Register my Institution")).toBeInTheDocument();
      expect(
        screen.queryByText("Register as a Provider")
      ).not.toBeInTheDocument();
    });

    test('hides "Register my Institution" when institution is already registered', () => {
      useOptionalUser.mockReturnValue({
        isLoggedIn: true,
        isProvider: false,
        isProviderLoading: false,
        isSSO: true,
        user: { id: "1", role: "staff", scopedRole: "" },
        isInstitutionRegistered: true,
        isInstitutionRegistrationLoading: false,
        institutionRegistrationStatus: "registered",
      });
      mockHasAdminRole.mockReturnValue(true);

      render(<Navbar />);
      expect(
        screen.queryByText("Register my Institution")
      ).not.toBeInTheDocument();
    });

    test('hides "Register my Institution" while institution registration is pending', () => {
      useOptionalUser.mockReturnValue({
        isLoggedIn: true,
        isProvider: false,
        isProviderLoading: false,
        isSSO: true,
        user: { id: "1", role: "staff", scopedRole: "" },
        isInstitutionRegistered: false,
        isInstitutionRegistrationLoading: false,
        institutionRegistrationStatus: null,
      });
      mockHasAdminRole.mockReturnValue(true);

      render(<Navbar />);
      expect(
        screen.queryByText("Register my Institution")
      ).not.toBeInTheDocument();
    });

    test("shows Lab Panel when institution is registered", () => {
      useOptionalUser.mockReturnValue({
        isLoggedIn: true,
        isProvider: false,
        isProviderLoading: false,
        isSSO: true,
        user: { id: "1", role: "faculty" },
        isInstitutionRegistered: true,
        isInstitutionRegistrationLoading: false,
        institutionRegistrationStatus: "registered",
      });
      mockHasAdminRole.mockReturnValue(true);

      render(<Navbar />);
      expect(screen.getByText("Lab Panel")).toBeInTheDocument();
    });

    test("hides Lab Panel while institution registration is pending", () => {
      useOptionalUser.mockReturnValue({
        isLoggedIn: true,
        isProvider: false,
        isProviderLoading: false,
        isSSO: true,
        user: { id: "1", role: "faculty" },
        isInstitutionRegistered: false,
        isInstitutionRegistrationLoading: false,
        institutionRegistrationStatus: null,
      });
      mockHasAdminRole.mockReturnValue(true);

      render(<Navbar />);
      expect(screen.queryByText("Lab Panel")).not.toBeInTheDocument();
    });
  });

  /**
   * Tests for SSO users WITHOUT admin privileges (students, alum, etc.)
   */
  describe("SSO user without admin privileges", () => {
    beforeEach(() => {
      useOptionalUser.mockReturnValue({
        isLoggedIn: true,
        isProvider: false,
        isProviderLoading: false,
        isSSO: true,
        user: { id: "1", role: "student", scopedRole: "" },
        isInstitutionRegistered: false,
        isInstitutionRegistrationLoading: false,
        institutionRegistrationStatus: "unregistered",
      });
      mockHasAdminRole.mockReturnValue(false);
    });

    test("hides register button completely for non-admin SSO users", () => {
      render(<Navbar />);
      expect(
        screen.queryByText("Register my Institution")
      ).not.toBeInTheDocument();
      expect(
        screen.queryByText("Register as a Provider")
      ).not.toBeInTheDocument();
    });
  });

  /**
   * Tests for confirmed providers
   */
  describe("when user is a confirmed provider", () => {
    beforeEach(() => {
      useOptionalUser.mockReturnValue({
        isLoggedIn: true,
        isProvider: true,
        isProviderLoading: false,
        isSSO: false,
        user: { id: "1" },
        isInstitutionRegistered: false,
        isInstitutionRegistrationLoading: false,
      });
    });

    test("shows Lab Panel and hides register", () => {
      render(<Navbar />);
      expect(screen.getByText("Lab Panel")).toBeInTheDocument();
      expect(
        screen.queryByText("Register as a Provider")
      ).not.toBeInTheDocument();
    });
  });

  /**
   * Mobile menu tests
   */
  describe("mobile menu", () => {
    beforeEach(() => {
      useOptionalUser.mockReturnValue({
        isLoggedIn: true,
        isProvider: false,
        isProviderLoading: false,
        isSSO: false,
        user: { id: "1" },
        isInstitutionRegistered: false,
        isInstitutionRegistrationLoading: false,
      });
    });

    test("toggles mobile menu correctly", () => {
      render(<Navbar />);
      const button = screen.getByRole("button");

      expect(screen.getAllByText("Book a Lab")).toHaveLength(1);
      fireEvent.click(button);
      expect(screen.getAllByText("Book a Lab")).toHaveLength(2);
      fireEvent.click(button);
      expect(screen.getAllByText("Book a Lab")).toHaveLength(1);
    });
  });

  /**
   * Loading state tests
   */
  describe("loading states", () => {
    test("shows menu but hides register during provider loading", () => {
      useOptionalUser.mockReturnValue({
        isLoggedIn: true,
        isProvider: false,
        isProviderLoading: true,
        isSSO: false,
        user: { id: "1" },
        isInstitutionRegistered: false,
        isInstitutionRegistrationLoading: false,
      });

      render(<Navbar />);
      expect(screen.getByText("Book a Lab")).toBeInTheDocument();
      expect(
        screen.queryByText("Register as a Provider")
      ).not.toBeInTheDocument();
    });
  });
});
