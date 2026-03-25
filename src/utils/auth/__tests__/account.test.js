import { render, screen, fireEvent, act } from "@testing-library/react";
import "@testing-library/jest-dom";
import Account from "../account";

jest.mock("@fortawesome/react-fontawesome", () => ({
  FontAwesomeIcon: ({ className, title }) => (
    <span data-testid="logout-icon" className={className} title={title}>
      Logout Icon
    </span>
  ),
}));

jest.mock("@fortawesome/free-solid-svg-icons", () => ({
  faSignOutAlt: "mocked-icon",
}));

jest.mock("@/utils/dev/logger", () => ({
  __esModule: true,
  default: {
    log: jest.fn(),
    error: jest.fn(),
  },
}));

let mockUserContext = {
  isLoggedIn: false,
  address: null,
  user: null,
  logoutSSO: jest.fn(),
};

jest.mock("@/context/UserContext", () => ({
  useUser: () => mockUserContext,
}));

describe("Account Component", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    mockUserContext = {
      isLoggedIn: false,
      address: null,
      user: null,
      logoutSSO: jest.fn(),
    };
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  test("renders logout button in all states", () => {
    render(<Account />);
    expect(screen.getByRole("button", { name: "Logout" })).toBeInTheDocument();
    expect(screen.getByTestId("logout-icon")).toHaveAttribute("title", "Logout");
  });

  test("does not show account details when user is not logged in", () => {
    render(<Account />);
    expect(screen.queryByText(/@/)).not.toBeInTheDocument();
    expect(screen.queryByText("Not connected")).not.toBeInTheDocument();
  });

  test("shows institution and email for logged-in institutional users", () => {
    mockUserContext = {
      isLoggedIn: true,
      address: null,
      user: {
        institutionName: "Test University",
        email: "john@university.edu",
      },
      logoutSSO: jest.fn(),
    };

    render(<Account />);
    expect(screen.getByText("Test University")).toBeInTheDocument();
    expect(screen.getByText("john@university.edu")).toBeInTheDocument();
  });

  test("falls back through affiliation, name, id, and address formatting", () => {
    const { rerender } = render(<Account />);

    mockUserContext = {
      isLoggedIn: true,
      address: null,
      user: {
        affiliation: "Stanford",
        id: "user-1",
      },
      logoutSSO: jest.fn(),
    };
    rerender(<Account />);
    expect(screen.getByText("Stanford")).toBeInTheDocument();
    expect(screen.getByText("user-1")).toBeInTheDocument();

    mockUserContext = {
      isLoggedIn: true,
      address: null,
      user: {
        name: "Jane Smith",
      },
      logoutSSO: jest.fn(),
    };
    rerender(<Account />);
    expect(screen.getByText("Jane Smith")).toBeInTheDocument();

    mockUserContext = {
      isLoggedIn: true,
      address: "0x1234567890abcdef1234567890abcdef12345678",
      user: {},
      logoutSSO: jest.fn(),
    };
    rerender(<Account />);
    expect(screen.getByText("0x1234...5678")).toBeInTheDocument();
  });

  test("calls logoutSSO when logout button is clicked", async () => {
    mockUserContext = {
      isLoggedIn: true,
      address: null,
      user: { name: "SSO User" },
      logoutSSO: jest.fn().mockResolvedValue(undefined),
    };

    render(<Account />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Logout" }));
    });

    expect(mockUserContext.logoutSSO).toHaveBeenCalled();
  });

  test("handles logout errors gracefully without crashing", async () => {
    mockUserContext = {
      isLoggedIn: true,
      address: null,
      user: { name: "SSO User" },
      logoutSSO: jest.fn().mockRejectedValue(new Error("Logout failed")),
    };

    const initialHref = window.location.href;

    render(<Account />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Logout" }));
    });

    expect(mockUserContext.logoutSSO).toHaveBeenCalled();

    act(() => {
      jest.runAllTimers();
    });

    expect(window.location.href).toBe(initialHref);
  });
});
