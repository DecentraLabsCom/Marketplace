/**
 * Unit Tests for WalletLogin Component
 *
 * Tests the wallet authentication component for Web3 wallet connections.
 * Validates modal behavior, wallet connector interactions, and UI state management.
 *
 * Test Behaviors:
 * - Button Rendering - Main wallet login button displays correctly
 * - Modal Opening/Closing - Modal visibility controlled by user interactions
 * - Wallet Connectors - Lists available wallet options from wagmi
 * - Connection Flow - Handles wallet connection via connect function
 * - WalletConnect Disconnect - Disconnects WalletConnect on modal close
 * - WalletOption Ready State - Shows available/unavailable wallet states
 * - Wallet Icons - Renders correct icons based on wallet type
 * - Error Handling - Catches and logs connection errors
 *
 */

import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import { useConnect, useDisconnect } from "wagmi";
import devLog from "@/utils/dev/logger";
import WalletLogin from "../WalletLogin";

// Mock dependencies
jest.mock("wagmi", () => ({
  useConnect: jest.fn(),
  useDisconnect: jest.fn(),
}));
jest.mock("@/utils/dev/logger");
jest.mock("next/image", () => ({
  __esModule: true,
  default: (props) => {
    return <img {...props} />;
  },
}));
jest.mock("@fortawesome/react-fontawesome", () => ({
  FontAwesomeIcon: ({ icon, className }) => (
    <span data-testid="font-awesome-icon" className={className}>
      {icon.iconName}
    </span>
  ),
}));

describe("WalletLogin", () => {
  const mockSetIsModalOpen = jest.fn();
  const mockConnect = jest.fn();
  const mockDisconnect = jest.fn();

  const mockConnectors = [
    {
      uid: "metamask-1",
      name: "MetaMask",
      ready: true,
      getProvider: jest.fn().mockResolvedValue({}),
    },
    {
      uid: "walletconnect-1",
      name: "WalletConnect",
      ready: true,
      getProvider: jest.fn().mockResolvedValue({}),
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();

    useConnect.mockReturnValue({
      connectors: mockConnectors,
      connect: mockConnect,
    });

    useDisconnect.mockReturnValue({
      disconnect: mockDisconnect,
    });
  });

  // Button Rendering Tests

  describe("Button Rendering", () => {
    test("renders wallet login button with correct text", () => {
      render(<WalletLogin setIsModalOpen={mockSetIsModalOpen} />);

      expect(screen.getByText("Wallet Login")).toBeInTheDocument();
      expect(screen.getByText("Connect your Web3 wallet")).toBeInTheDocument();
    });

    test("renders wallet icon in login button", () => {
      render(<WalletLogin setIsModalOpen={mockSetIsModalOpen} />);

      const walletIcon = screen.getAllByTestId("font-awesome-icon")[0];
      expect(walletIcon).toBeInTheDocument();
      expect(walletIcon).toHaveClass("text-brand");
    });
  });

  // Modal Opening/Closing Tests

  describe("Modal Behavior", () => {
    test("modal is closed by default", () => {
      render(<WalletLogin setIsModalOpen={mockSetIsModalOpen} />);

      expect(screen.queryByText("Choose Wallet")).not.toBeInTheDocument();
    });

    test("opens modal when wallet login button is clicked", () => {
      render(<WalletLogin setIsModalOpen={mockSetIsModalOpen} />);
      const loginButton = screen.getByText("Wallet Login").closest("button");

      fireEvent.click(loginButton);

      expect(screen.getByText("Choose Wallet")).toBeInTheDocument();
      expect(
        screen.getByText("Connect your preferred wallet to get started")
      ).toBeInTheDocument();
      expect(mockSetIsModalOpen).toHaveBeenCalledWith(true);
    });

    test("closes modal when close button is clicked", () => {
      render(<WalletLogin setIsModalOpen={mockSetIsModalOpen} />);
      const loginButton = screen.getByText("Wallet Login").closest("button");
      fireEvent.click(loginButton);

      const closeButton = screen
        .getAllByRole("button")
        .find((button) => button.querySelector('svg path[d*="M6 18L18 6"]'));
      fireEvent.click(closeButton);

      expect(screen.queryByText("Choose Wallet")).not.toBeInTheDocument();
      expect(mockSetIsModalOpen).toHaveBeenCalledWith(false);
    });

    test("prevents modal close when clicking inside modal content", () => {
      render(<WalletLogin setIsModalOpen={mockSetIsModalOpen} />);
      const loginButton = screen.getByText("Wallet Login").closest("button");
      fireEvent.click(loginButton);
      mockSetIsModalOpen.mockClear();

      const modalContent = screen.getByText("Choose Wallet").closest("div");
      fireEvent.click(modalContent);

      expect(screen.getByText("Choose Wallet")).toBeInTheDocument();
      expect(mockSetIsModalOpen).not.toHaveBeenCalled();
    });
  });

  // Wallet Connectors Tests

  describe("Wallet Connectors", () => {
    test("renders all available wallet connectors", async () => {
      render(<WalletLogin setIsModalOpen={mockSetIsModalOpen} />);
      fireEvent.click(screen.getByText("Wallet Login").closest("button"));

      await waitFor(() => {
        expect(screen.getByText("MetaMask")).toBeInTheDocument();
        expect(screen.getByText("WalletConnect")).toBeInTheDocument();
      });
    });

    test("renders correct number of wallet options", async () => {
      render(<WalletLogin setIsModalOpen={mockSetIsModalOpen} />);
      fireEvent.click(screen.getByText("Wallet Login").closest("button"));

      await waitFor(() => {
        const walletButtons = screen
          .getAllByRole("button")
          .filter(
            (button) =>
              button.textContent.includes("MetaMask") ||
              button.textContent.includes("WalletConnect")
          );
        expect(walletButtons).toHaveLength(2);
      });
    });
  });

  // Connection Flow Tests

  describe("Connection Flow", () => {
    test("calls connect function when wallet option is clicked", async () => {
      render(<WalletLogin setIsModalOpen={mockSetIsModalOpen} />);
      fireEvent.click(screen.getByText("Wallet Login").closest("button"));

      await waitFor(() => {
        expect(screen.getByText("MetaMask")).toBeInTheDocument();
      });

      const metamaskButton = screen.getByText("MetaMask").closest("button");
      fireEvent.click(metamaskButton);

      expect(mockConnect).toHaveBeenCalledWith({
        connector: mockConnectors[0],
      });
    });

    test("closes modal after successful wallet connection", async () => {
      render(<WalletLogin setIsModalOpen={mockSetIsModalOpen} />);
      fireEvent.click(screen.getByText("Wallet Login").closest("button"));

      await waitFor(() => {
        expect(screen.getByText("MetaMask")).toBeInTheDocument();
      });

      const metamaskButton = screen.getByText("MetaMask").closest("button");
      fireEvent.click(metamaskButton);

      await waitFor(() => {
        expect(screen.queryByText("Choose Wallet")).not.toBeInTheDocument();
      });
    });

    test("logs error when connection fails", async () => {
      const connectionError = new Error("Connection failed");
      mockConnect.mockImplementation(() => {
        throw connectionError;
      });

      render(<WalletLogin setIsModalOpen={mockSetIsModalOpen} />);
      fireEvent.click(screen.getByText("Wallet Login").closest("button"));

      await waitFor(() => {
        expect(screen.getByText("MetaMask")).toBeInTheDocument();
      });

      const metamaskButton = screen.getByText("MetaMask").closest("button");
      fireEvent.click(metamaskButton);

      expect(devLog.error).toHaveBeenCalledWith(
        "Error connecting wallet:",
        connectionError
      );
    });
  });

  // WalletConnect Disconnect Tests

  describe("WalletConnect Disconnect", () => {
    test("disconnects WalletConnect when modal is closed", () => {
      render(<WalletLogin setIsModalOpen={mockSetIsModalOpen} />);
      fireEvent.click(screen.getByText("Wallet Login").closest("button"));

      const closeButton = screen
        .getAllByRole("button")
        .find((button) => button.querySelector('svg path[d*="M6 18L18 6"]'));
      fireEvent.click(closeButton);

      expect(mockDisconnect).toHaveBeenCalled();
    });

    test("does not disconnect if WalletConnect is not ready", () => {
      const connectorsWithoutReady = [
        {
          uid: "walletconnect-1",
          name: "WalletConnect",
          ready: false,
          getProvider: jest.fn().mockResolvedValue(null),
        },
      ];
      useConnect.mockReturnValue({
        connectors: connectorsWithoutReady,
        connect: mockConnect,
      });

      render(<WalletLogin setIsModalOpen={mockSetIsModalOpen} />);
      fireEvent.click(screen.getByText("Wallet Login").closest("button"));

      const closeButton = screen
        .getAllByRole("button")
        .find((button) => button.querySelector('svg path[d*="M6 18L18 6"]'));
      fireEvent.click(closeButton);

      expect(mockDisconnect).not.toHaveBeenCalled();
    });
  });

  // WalletOption Ready State Tests

  describe("WalletOption Ready State", () => {
    test("shows available state for ready wallet", async () => {
      render(<WalletLogin setIsModalOpen={mockSetIsModalOpen} />);
      fireEvent.click(screen.getByText("Wallet Login").closest("button"));

      await waitFor(() => {
        const metamaskButton = screen.getByText("MetaMask").closest("button");
        expect(metamaskButton).not.toBeDisabled();
        expect(
          screen.getByText("Browser extension wallet")
        ).toBeInTheDocument();
      });
    });

    test("shows unavailable state for non-ready wallet", async () => {
      const connectorsWithUnavailable = [
        {
          uid: "phantom-1",
          name: "Phantom",
          ready: false,
          getProvider: jest.fn().mockResolvedValue(null),
        },
      ];
      useConnect.mockReturnValue({
        connectors: connectorsWithUnavailable,
        connect: mockConnect,
      });

      render(<WalletLogin setIsModalOpen={mockSetIsModalOpen} />);
      fireEvent.click(screen.getByText("Wallet Login").closest("button"));

      await waitFor(() => {
        const phantomButton = screen.getByText("Phantom").closest("button");
        expect(phantomButton).toBeDisabled();
        expect(screen.getByText("Not available")).toBeInTheDocument();
      });
    });

    test("prevents click on disabled wallet option", async () => {
      const connectorsWithUnavailable = [
        {
          uid: "phantom-1",
          name: "Phantom",
          ready: false,
          getProvider: jest.fn().mockResolvedValue(null),
        },
      ];
      useConnect.mockReturnValue({
        connectors: connectorsWithUnavailable,
        connect: mockConnect,
      });

      render(<WalletLogin setIsModalOpen={mockSetIsModalOpen} />);
      fireEvent.click(screen.getByText("Wallet Login").closest("button"));

      await waitFor(() => {
        expect(screen.getByText("Phantom")).toBeInTheDocument();
      });

      const phantomButton = screen.getByText("Phantom").closest("button");
      fireEvent.click(phantomButton);

      expect(mockConnect).not.toHaveBeenCalled();
    });
  });

  // Wallet Icons Tests

  describe("Wallet Icons", () => {
    test("renders MetaMask icon for MetaMask wallet", async () => {
      render(<WalletLogin setIsModalOpen={mockSetIsModalOpen} />);
      fireEvent.click(screen.getByText("Wallet Login").closest("button"));

      await waitFor(() => {
        const metamaskIcon = screen.getByAltText("MetaMask");
        expect(metamaskIcon).toBeInTheDocument();
        expect(metamaskIcon).toHaveAttribute("src", "/wallets/MetaMask.svg");
      });
    });

    test("renders WalletConnect icon for WalletConnect wallet", async () => {
      render(<WalletLogin setIsModalOpen={mockSetIsModalOpen} />);
      fireEvent.click(screen.getByText("Wallet Login").closest("button"));

      await waitFor(() => {
        const walletConnectIcon = screen.getByAltText("WalletConnect");
        expect(walletConnectIcon).toBeInTheDocument();
        expect(walletConnectIcon).toHaveAttribute(
          "src",
          "/wallets/WalletConnect.svg"
        );
      });
    });

    test("renders Phantom icon for Phantom wallet", async () => {
      const connectorsWithPhantom = [
        {
          uid: "phantom-1",
          name: "Phantom",
          ready: true,
          getProvider: jest.fn().mockResolvedValue({}),
        },
      ];
      useConnect.mockReturnValue({
        connectors: connectorsWithPhantom,
        connect: mockConnect,
      });

      render(<WalletLogin setIsModalOpen={mockSetIsModalOpen} />);
      fireEvent.click(screen.getByText("Wallet Login").closest("button"));

      await waitFor(() => {
        const phantomIcon = screen.getByAltText("Phantom");
        expect(phantomIcon).toBeInTheDocument();
        expect(phantomIcon).toHaveAttribute("src", "/wallets/Phantom.svg");
      });
    });

    test("renders default wallet icon for unknown wallet", async () => {
      const connectorsWithUnknown = [
        {
          uid: "unknown-1",
          name: "UnknownWallet",
          ready: true,
          getProvider: jest.fn().mockResolvedValue({}),
        },
      ];
      useConnect.mockReturnValue({
        connectors: connectorsWithUnknown,
        connect: mockConnect,
      });

      render(<WalletLogin setIsModalOpen={mockSetIsModalOpen} />);
      fireEvent.click(screen.getByText("Wallet Login").closest("button"));

      await waitFor(() => {
        const walletIcons = screen.getAllByTestId("font-awesome-icon");
        expect(walletIcons.length).toBeGreaterThan(0);
      });
    });

    test("shows correct description for WalletConnect", async () => {
      render(<WalletLogin setIsModalOpen={mockSetIsModalOpen} />);
      fireEvent.click(screen.getByText("Wallet Login").closest("button"));

      await waitFor(() => {
        expect(
          screen.getByText("Mobile & hardware wallets")
        ).toBeInTheDocument();
      });
    });

    test("shows correct description for browser extension wallets", async () => {
      render(<WalletLogin setIsModalOpen={mockSetIsModalOpen} />);
      fireEvent.click(screen.getByText("Wallet Login").closest("button"));

      await waitFor(() => {
        const descriptions = screen.getAllByText("Browser extension wallet");
        expect(descriptions.length).toBeGreaterThan(0);
      });
    });
  });

  // Edge Cases

  describe("Edge Cases", () => {
    test("handles empty connectors array gracefully", async () => {
      useConnect.mockReturnValue({
        connectors: [],
        connect: mockConnect,
      });

      render(<WalletLogin setIsModalOpen={mockSetIsModalOpen} />);
      fireEvent.click(screen.getByText("Wallet Login").closest("button"));

      await waitFor(() => {
        expect(screen.getByText("Choose Wallet")).toBeInTheDocument();
        const walletButtons = screen
          .getAllByRole("button")
          .filter((button) => !button.textContent.includes("Wallet Login"));
        // Should only have close button
        expect(walletButtons.length).toBeLessThanOrEqual(1);
      });
    });

    test("handles async provider loading", async () => {
      const slowConnector = {
        uid: "slow-1",
        name: "SlowWallet",
        ready: true,
        getProvider: jest
          .fn()
          .mockImplementation(
            () => new Promise((resolve) => setTimeout(() => resolve({}), 100))
          ),
      };
      useConnect.mockReturnValue({
        connectors: [slowConnector],
        connect: mockConnect,
      });

      render(<WalletLogin setIsModalOpen={mockSetIsModalOpen} />);
      fireEvent.click(screen.getByText("Wallet Login").closest("button"));

      await waitFor(() => {
        expect(screen.getByText("SlowWallet")).toBeInTheDocument();
      });
    });
  });
});
