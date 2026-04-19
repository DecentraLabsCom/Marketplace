import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";
import Navbar from "../Navbar";
import { useOptionalUser } from "@/context/UserContext";
import { hasAdminRole } from "@/utils/auth/roleValidation";

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

describe("Navbar", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    hasAdminRole.mockReturnValue(false);
  });

  test("renders logo and auth control for logged-out users", () => {
    useOptionalUser.mockReturnValue({
      isLoggedIn: false,
      isProvider: false,
      isProviderLoading: false,
      isSSO: false,
      user: null,
      isInstitutionRegistered: false,
      isInstitutionRegistrationLoading: false,
      institutionRegistrationStatus: "unregistered",
    });

    render(<Navbar />);

    expect(screen.getByAltText("DecentraLabs Logo")).toBeInTheDocument();
    const loginControl =
      screen.queryByText("Login") || screen.getByTestId("login-skeleton");
    expect(loginControl).toBeInTheDocument();
    expect(screen.queryByText("Book a Lab")).not.toBeInTheDocument();
  });

  test("does not show institution registration entrypoint for non-SSO users", () => {
    useOptionalUser.mockReturnValue({
      isLoggedIn: true,
      isProvider: false,
      isProviderLoading: false,
      isSSO: false,
      user: { id: "1", role: "user" },
      isInstitutionRegistered: false,
      isInstitutionRegistrationLoading: false,
      institutionRegistrationStatus: "unregistered",
    });

    render(<Navbar />);

    expect(screen.getByText("Book a Lab")).toBeInTheDocument();
    expect(screen.queryByText("Register my Institution")).not.toBeInTheDocument();
  });

  test("shows institution registration entrypoint for eligible SSO admins", () => {
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
    hasAdminRole.mockReturnValue(true);

    render(<Navbar />);

    expect(screen.getByText("Register my Institution")).toBeInTheDocument();
  });

  test("shows Lab Panel for faculty at a registered institution", () => {
    useOptionalUser.mockReturnValue({
      isLoggedIn: true,
      isProvider: false,
      isProviderLoading: false,
      isSSO: true,
      user: { id: "1", role: "faculty", scopedRole: "" },
      isInstitutionRegistered: true,
      isInstitutionRegistrationLoading: false,
      institutionRegistrationStatus: "registered",
    });
    hasAdminRole.mockReturnValue(true);

    render(<Navbar />);

    expect(screen.getByText("Lab Panel")).toBeInTheDocument();
  });

  test("toggles the mobile menu", () => {
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
    hasAdminRole.mockReturnValue(true);

    render(<Navbar />);

    fireEvent.click(screen.getByRole("button", { name: /toggle navigation menu/i }));
    expect(screen.getAllByText("Book a Lab").length).toBeGreaterThan(0);
  });
});
