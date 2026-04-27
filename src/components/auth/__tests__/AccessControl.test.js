import { render, screen, waitFor } from "@testing-library/react";
import { useUser } from "@/context/UserContext";
import { useRouter } from "next/navigation";
import AccessControl from "../AccessControl";

jest.mock("@/context/UserContext", () => ({
  useUser: jest.fn(),
}));

jest.mock("next/navigation", () => ({
  useRouter: jest.fn(),
}));

describe("AccessControl", () => {
  const mockPush = jest.fn();
  const baseUser = {
    isLoggedIn: false,
    isSSO: false,
    isLoading: false,
    user: null,
    isProvider: false,
    isProviderLoading: false,
    isInstitutionRegistered: false,
    isInstitutionRegistrationLoading: false,
    institutionRegistrationStatus: "unregistered",
  };

  beforeEach(() => {
    jest.clearAllMocks();
    useRouter.mockReturnValue({ push: mockPush });
    useUser.mockReturnValue(baseUser);
  });

  test("shows loading state while authentication is resolving", () => {
    useUser.mockReturnValue({ ...baseUser, isLoading: true });

    render(
      <AccessControl>
        <div>Protected Content</div>
      </AccessControl>
    );

    expect(screen.getByText(/connecting/i)).toBeInTheDocument();
    expect(screen.queryByText("Protected Content")).not.toBeInTheDocument();
  });

  test("renders children for logged-in users", () => {
    useUser.mockReturnValue({ ...baseUser, isLoggedIn: true });

    render(
      <AccessControl>
        <div>Protected Content</div>
      </AccessControl>
    );

    expect(screen.getByText("Protected Content")).toBeInTheDocument();
  });

  test("renders children when SSO is required and user is SSO authenticated", () => {
    useUser.mockReturnValue({
      ...baseUser,
      isLoggedIn: true,
      isSSO: true,
      user: { email: "test@university.edu" },
    });

    render(
      <AccessControl requireSSO>
        <div>SSO Protected Content</div>
      </AccessControl>
    );

    expect(screen.getByText("SSO Protected Content")).toBeInTheDocument();
  });

  test("renders children when SSO provider is confirmed", () => {
    useUser.mockReturnValue({
      ...baseUser,
      isLoggedIn: true,
      isSSO: true,
      user: { email: "lab@university.edu" },
      isProvider: true,
      isProviderLoading: false,
    });

    render(
      <AccessControl requireProvider>
        <div>Provider Dashboard</div>
      </AccessControl>
    );

    expect(screen.getByText("Provider Dashboard")).toBeInTheDocument();
  });

  test("renders children when SSO faculty belongs to a registered institution", () => {
    useUser.mockReturnValue({
      ...baseUser,
      isLoggedIn: true,
      isSSO: true,
      user: { email: "professor@university.edu", role: "Faculty" },
      isInstitutionRegistered: true,
      institutionRegistrationStatus: "registered",
    });

    render(
      <AccessControl requireProvider>
        <div>Provider Dashboard</div>
      </AccessControl>
    );

    expect(screen.getByText("Provider Dashboard")).toBeInTheDocument();
  });

  test("shows institutional login message when provider area is opened without SSO", () => {
    render(
      <AccessControl requireProvider>
        <div>Provider Dashboard</div>
      </AccessControl>
    );

    expect(screen.getByText(/institutional login is required/i)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /register as provider/i })
    ).not.toBeInTheDocument();
  });

  test("redirects denied users to home page", async () => {
    render(
      <AccessControl>
        <div>Protected Content</div>
      </AccessControl>
    );

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/");
    });
  });
});
