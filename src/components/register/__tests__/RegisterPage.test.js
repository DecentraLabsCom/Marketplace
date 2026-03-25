import React from "react";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import RegisterPage from "../RegisterPage";
import { useUser } from "@/context/UserContext";
import { hasAdminRole } from "@/utils/auth/roleValidation";
import { useRouter } from "next/navigation";

jest.mock("@/context/UserContext");
jest.mock("@/utils/auth/roleValidation");
jest.mock("next/navigation", () => ({
  useRouter: jest.fn(),
}));

jest.mock("@fortawesome/react-fontawesome", () => ({
  FontAwesomeIcon: () => <span data-testid="font-awesome-icon" />,
}));

jest.mock("@/components/ui", () => ({
  Container: ({ children, className }) => (
    <div data-testid="container" className={className}>
      {children}
    </div>
  ),
  Button: ({ children, onClick, className }) => (
    <button data-testid="mock-button" onClick={onClick} className={className}>
      {children}
    </button>
  ),
}));

jest.mock("../ProviderAccessDenied", () => {
  return function MockProviderAccessDenied({ reason, userRole, scopedRole }) {
    return (
      <div data-testid="access-denied">
        <span>Access Denied</span>
        <span data-testid="denial-reason">{reason}</span>
        {userRole && <span data-testid="user-role">{userRole}</span>}
        {scopedRole && <span data-testid="scoped-role">{scopedRole}</span>}
      </div>
    );
  };
});

jest.mock("@/components/dashboard/user/InstitutionInviteCard", () => ({
  __esModule: true,
  default: () => (
    <div data-testid="institution-invite-card">Institution Invite Card</div>
  ),
}));

describe("RegisterPage", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useRouter.mockReturnValue({ push: jest.fn() });
  });

  test("shows loading while user data resolves", () => {
    useUser.mockReturnValue({
      isSSO: false,
      user: null,
      isLoading: true,
    });

    render(<RegisterPage />);

    expect(screen.getByText("Loading...")).toBeInTheDocument();
  });

  test("denies access to non-SSO users", () => {
    useUser.mockReturnValue({
      isSSO: false,
      user: null,
      isLoading: false,
    });

    render(<RegisterPage />);

    expect(screen.getByTestId("access-denied")).toBeInTheDocument();
    expect(screen.getByTestId("denial-reason")).toHaveTextContent(
      "Institutional login is required to register an institution."
    );
  });

  test("shows validating state for SSO users before user payload is available", () => {
    useUser.mockReturnValue({
      isSSO: true,
      user: null,
      isLoading: false,
      institutionRegistrationStatus: "unregistered",
    });

    render(<RegisterPage />);

    expect(screen.getByText("Validating permissions...")).toBeInTheDocument();
  });

  test("renders institution choices for eligible SSO admins", () => {
    useUser.mockReturnValue({
      isSSO: true,
      user: { role: "employee", scopedRole: "" },
      isLoading: false,
      isInstitutionRegistered: false,
      isInstitutionRegistrationLoading: false,
      institutionRegistrationStatus: "unregistered",
    });
    hasAdminRole.mockReturnValue(true);

    render(<RegisterPage />);

    expect(
      screen.getByText(/Choose how your institution wants to participate/i)
    ).toBeInTheDocument();
  });

  test("denies SSO users without institution admin privileges", () => {
    useUser.mockReturnValue({
      isSSO: true,
      user: { role: "student", scopedRole: "learner" },
      isLoading: false,
      isInstitutionRegistered: false,
      isInstitutionRegistrationLoading: false,
      institutionRegistrationStatus: "unregistered",
    });
    hasAdminRole.mockReturnValue(false);

    render(<RegisterPage />);

    expect(screen.getByTestId("access-denied")).toBeInTheDocument();
    expect(screen.getByTestId("denial-reason")).toHaveTextContent(
      "Your institutional role does not allow institution-level registration. Only staff, employees, or faculty can register an institution."
    );
  });

  test("blocks the page when institution is already registered", () => {
    useUser.mockReturnValue({
      isSSO: true,
      user: { role: "staff", scopedRole: "" },
      isLoading: false,
      isInstitutionRegistered: true,
      isInstitutionRegistrationLoading: false,
      institutionRegistrationStatus: "registered",
    });

    render(<RegisterPage />);

    expect(screen.getByText("Access Restricted")).toBeInTheDocument();
    expect(
      screen.getByText(/institution is already registered/i)
    ).toBeInTheDocument();
  });
});
