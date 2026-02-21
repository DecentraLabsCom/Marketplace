/**
 * Unit Tests for ProviderDashboard Component
 *
 * Tests Behaviors:
 * - Access control (provider validation, loading, redirects)
 * - Rendering (header, list, calendar, actions)
 * - Lab selection & auto-select
 * - CRUD (add, edit, delete, list/unlist)
 * - File sync (temp → labId, JSON metadata)
 * - Funds collection
 * - Error handling (query, mutation, UI)
 * - Edge cases (empty, null, errors, loading)
 */

import {
  render,
  screen,
  waitFor,
  fireEvent,
  act,
  within,
} from "@testing-library/react";
import "@testing-library/jest-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import ProviderDashboard from "../ProviderDashboardPage";

// Mock navigation
const mockPush = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

// Mock viem utilities
jest.mock("viem", () => ({
  parseUnits: jest.fn((value) => BigInt(Math.floor(parseFloat(value) * 1e18))),
}));

// Mock wagmi hooks used by staking / contract read hooks
jest.mock('wagmi', () => ({
  useReadContract: jest.fn(() => ({ data: null, isLoading: false, isError: false })),
  useConnection: jest.fn(() => ({ chain: { id: 1, name: 'Ethereum' } })),
  useAccount: jest.fn(() => ({ address: '0xProviderAddress', isConnected: true })),
}));

// Mock logger
jest.mock("@/utils/dev/logger", () => ({
  __esModule: true,
  default: {
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

// State management
let mockUserData = {
  address: "0xProviderAddress",
  user: { name: "Test Provider", email: "provider@test.com" },
  isSSO: false,
  isProvider: true,
  isProviderLoading: false,
  isLoading: false,
};

let mockLabsData = {
  data: { labs: [] },
  isLoading: false,
  isError: false,
  error: null,
};

let mockBookingsData = {
  data: { bookings: [] },
  isError: false,
};

let mockSelectedLabPendingPayout = {
  data: { walletPayout: "100", institutionalPayout: "0", totalPayout: "100", institutionalCollectorCount: 0 },
  isLoading: false,
  isError: false,
};

// Mock functions
const mockAddTemporaryNotification = jest.fn();
const mockAddPersistentNotification = jest.fn();
const mockAddNotification = jest.fn(() => ({ id: "notif_1" }));
const mockRemoveNotification = jest.fn();
const mockAddLabMutate = jest.fn();
const mockUpdateLabMutate = jest.fn();
const mockDeleteLabMutate = jest.fn();
const mockListLabMutate = jest.fn();
const mockUnlistLabMutate = jest.fn();
const mockRequestFundsMutate = jest.fn();
const mockSaveLabDataMutate = jest.fn();
const mockDeleteLabDataMutate = jest.fn();
const mockMoveFilesMutate = jest.fn();

const expectTempNotificationCall = (status, messageMatcher) => {
  expect(mockAddTemporaryNotification).toHaveBeenCalledWith(
    status,
    messageMatcher,
    null,
    expect.objectContaining({
      dedupeKey: expect.any(String),
      dedupeWindowMs: expect.any(Number),
    })
  );
};

// Context mocks
jest.mock("@/context/UserContext", () => ({
  useUser: () => mockUserData,
  useOptionalUser: () => mockUserData,
  UserData: ({ children }) => children,
}));

jest.mock("@/context/NotificationContext", () => ({
  useNotifications: () => ({
    addTemporaryNotification: mockAddTemporaryNotification,
    addPersistentNotification: mockAddPersistentNotification,
    addNotification: mockAddNotification,
    removeNotification: mockRemoveNotification,
  }),
}));

jest.mock("@/context/LabTokenContext", () => ({
  useLabToken: () => ({ decimals: 18 }),
}));

// Mock Optimistic UI context to prevent provider dependency and spy on optimistic state methods
const mockSetOptimisticListingState = jest.fn();
const mockCompleteOptimisticListingState = jest.fn();
const mockClearOptimisticListingState = jest.fn();
const mockSetOptimisticLabState = jest.fn();
const mockClearOptimisticLabState = jest.fn();
jest.mock("@/context/OptimisticUIContext", () => ({
  useOptimisticUI: () => ({
    setOptimisticListingState: mockSetOptimisticListingState,
    completeOptimisticListingState: mockCompleteOptimisticListingState,
    clearOptimisticListingState: mockClearOptimisticListingState,
    setOptimisticLabState: mockSetOptimisticLabState,
    clearOptimisticLabState: mockClearOptimisticLabState,
  }),
}));

// Hook mocks
jest.mock("@/hooks/lab/useLabs", () => ({
  useLabsForProvider: () => mockLabsData,
  useAddLab: () => ({ mutateAsync: mockAddLabMutate }),
  useUpdateLab: () => ({ mutate: mockUpdateLabMutate, mutateAsync: mockUpdateLabMutate }),
  useDeleteLab: () => ({ mutateAsync: mockDeleteLabMutate }),
  useListLab: () => ({ mutateAsync: mockListLabMutate }),
  useUnlistLab: () => ({ mutateAsync: mockUnlistLabMutate }),
}));

jest.mock("@/hooks/booking/useBookings", () => ({
  useLabBookingsDashboard: () => mockBookingsData,
  useRequestFunds: () => ({ mutateAsync: mockRequestFundsMutate }),
}));

jest.mock("@/hooks/provider/useProvider", () => ({
  useSaveLabData: () => ({ mutateAsync: mockSaveLabDataMutate }),
  useDeleteLabData: () => ({ mutateAsync: mockDeleteLabDataMutate }),
  useMoveFiles: () => ({ mutateAsync: mockMoveFilesMutate }),
}));

// Component mocks
jest.mock("@/components/ui", () => ({
  Container: ({ children }) => <div data-testid="container">{children}</div>,
}));

jest.mock("@/components/auth/AccessControl", () => ({
  __esModule: true,
  default: ({ children, requireProvider }) => (
    <div data-testid="access-control" data-require-provider={requireProvider}>
      {children}
    </div>
  ),
}));

jest.mock("@/components/dashboard/user/DashboardHeader", () => ({
  __esModule: true,
  default: ({ title }) => <h1 data-testid="dashboard-header">{title}</h1>,
}));

jest.mock("@/components/dashboard/provider/ProviderLabsList", () => ({
  __esModule: true,
  default: ({
    ownedLabs,
    selectedLabId,
    onSelectChange,
    onEdit,
    onDelete,
    onList,
    onUnlist,
  }) => (
    <div data-testid="labs-list">
      <select
        data-testid="lab-select"
        value={selectedLabId}
        onChange={onSelectChange}
      >
        <option value="" key="empty">
          Select Lab
        </option>
        {ownedLabs.map((lab) => (
          <option key={lab.id || lab.name} value={lab.id}>
            {lab.name}
          </option>
        ))}
      </select>
      <div data-testid="lab-items">
        {ownedLabs.map((lab) => (
          <div key={lab.id || lab.name} data-testid={`lab-item-${lab.id}`}>
            <span data-testid={`lab-name-${lab.id}`}>{lab.name}</span>
            <button onClick={onEdit} data-testid={`edit-${lab.id}`}>
              Edit
            </button>
            <button
              onClick={() => onDelete(lab.id)}
              data-testid={`delete-${lab.id}`}
            >
              Delete
            </button>
            {lab.listed ? (
              <button
                onClick={() => onUnlist(lab.id)}
                data-testid={`unlist-${lab.id}`}
              >
                Unlist
              </button>
            ) : (
              <button
                onClick={() => onList(lab.id)}
                data-testid={`list-${lab.id}`}
              >
                List
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  ),
}));

jest.mock("@/components/dashboard/provider/ReservationsCalendar", () => ({
  __esModule: true,
  default: ({ selectedDate, onDateChange, bookingInfo }) => (
    <div data-testid="calendar">
      <div data-testid="booking-count">{bookingInfo.length} bookings</div>
      <button onClick={() => onDateChange(new Date())}>Change Date</button>
    </div>
  ),
}));

jest.mock("@/components/dashboard/provider/ProviderActions", () => ({
  __esModule: true,
  default: ({ onCollect, onAddNewLab, isSSO, isCollectEnabled, isCollecting }) => (
    <div data-testid="actions">
      {!isSSO && (
        <button onClick={onCollect} disabled={!isCollectEnabled || isCollecting} data-testid="collect">
          Collect
        </button>
      )}
      <button onClick={onAddNewLab} data-testid="add-new-lab">
        Add New Lab
      </button>
    </div>
  ),
}));

// Mock staking components used by the dashboard (keep unit tests isolated)
jest.mock('@/components/dashboard/provider/staking/ProviderStakingPanel', () => ({
  __esModule: true,
  default: ({ providerAddress, isSSO, labCount }) => (
    <div data-testid="provider-staking-panel">Staking (mock)</div>
  ),
}));

jest.mock('@/components/dashboard/provider/staking/PendingPayoutsPanel', () => ({
  __esModule: true,
  default: ({ labs, onCollect, isSSO, isCollectEnabled, isCollecting }) => (
    <div data-testid="pending-payouts-panel">Pending Payouts (mock)</div>
  ),
}));

jest.mock('@/components/dashboard/provider/staking/StakeHealthIndicator', () => ({
  __esModule: true,
  default: ({ variant }) => (
    <span data-testid="stake-health-indicator">Health</span>
  ),
}));

// Mock staking hooks barrel to avoid pulling in @wagmi/core ESM (not transformable by Jest)
jest.mock('@/hooks/staking/useStaking', () => ({
  useStakeInfo: jest.fn(() => ({ data: null, isLoading: false, isError: false })),
  useRequiredStake: jest.fn(() => ({ data: null, isLoading: false, isError: false })),
  usePendingLabPayout: jest.fn(() => mockSelectedLabPendingPayout),
}));

jest.mock("@/components/dashboard/provider/LabModal", () => ({
  __esModule: true,
  default: ({ isOpen, onClose, onSubmit, lab }) =>
    isOpen ? (
      <div data-testid="lab-modal">
        <div data-testid="modal-lab-id">{lab.id || "new"}</div>
        <button onClick={onClose} data-testid="modal-close">
          Close
        </button>
        <button
          onClick={() =>
            onSubmit({
              ...lab,
              name: lab.name || "New Lab",
              price: lab.price || "100",
            })
          }
          data-testid="modal-submit"
        >
          Submit
        </button>
      </div>
    ) : null,
}));

// QueryClient wrapper for tests (ProviderDashboard uses React Query hooks)
const createTestQueryClient = () =>
  new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });

let queryClient;
const renderWithClient = (ui, options) =>
  render(ui, { wrapper: ({ children }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>, ...options });

describe("ProviderDashboard Component", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
    // create a fresh QueryClient for each test
    queryClient = createTestQueryClient();

    // Reset to default provider state
    mockUserData = {
      address: "0xProviderAddress",
      user: { name: "Test Provider", email: "provider@test.com" },
      isSSO: false,
      isProvider: true,
      isProviderLoading: false,
      isLoading: false,
    };

    // Reset to empty labs
    mockLabsData = {
      data: { labs: [] },
      isLoading: false,
      isError: false,
      error: null,
    };

    mockBookingsData = {
      data: { bookings: [] },
      isError: false,
    };

    mockSelectedLabPendingPayout = {
      data: { walletPayout: "100", institutionalPayout: "0", totalPayout: "100", institutionalCollectorCount: 0 },
      isLoading: false,
      isError: false,
    };
  });

  describe("Access Control", () => {
    test("renders dashboard for authenticated provider", async () => {
      renderWithClient(<ProviderDashboard />);

      expect(await screen.findByText("Lab Panel")).toBeInTheDocument();
      expect(screen.getByTestId("labs-list")).toBeInTheDocument();
      expect(screen.getByTestId("calendar")).toBeInTheDocument();
      expect(screen.getByTestId("actions")).toBeInTheDocument();
    });

    test("redirects non-provider to home page", async () => {
      mockUserData.isProvider = false;
      mockUserData.isLoading = false;
      mockUserData.isProviderLoading = false;

      renderWithClient(<ProviderDashboard />);

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith("/");
      });
    });

    test("does not redirect while loading", async () => {
      mockUserData.isLoading = true;

      renderWithClient(<ProviderDashboard />);

      await waitFor(
        () => {
          expect(mockPush).not.toHaveBeenCalled();
        },
        { timeout: 500 }
      );
    });

    test("does not redirect while provider status loading", async () => {
      mockUserData.isProviderLoading = true;

      renderWithClient(<ProviderDashboard />);

      await waitFor(
        () => {
          expect(mockPush).not.toHaveBeenCalled();
        },
        { timeout: 500 }
      );
    });

    test("requires provider in AccessControl", () => {
      renderWithClient(<ProviderDashboard />);

      const accessControl = screen.getByTestId("access-control");
      expect(accessControl).toHaveAttribute("data-require-provider", "true");
    });
  });

  describe("Component Rendering", () => {
    test("displays dashboard header with correct title", () => {
      renderWithClient(<ProviderDashboard />);

      expect(screen.getByTestId("dashboard-header")).toHaveTextContent(
        "Lab Panel"
      );
    });

    test("renders all main dashboard sections", () => {
      renderWithClient(<ProviderDashboard />);

      expect(screen.getByTestId("labs-list")).toBeInTheDocument();
      expect(screen.getByTestId("calendar")).toBeInTheDocument();
      expect(screen.getByTestId("actions")).toBeInTheDocument();
    });

    test("shows staking compact card and opens modal for wallet users", async () => {
      // default mockUserData.isSSO = false
      renderWithClient(<ProviderDashboard />);

      // compact card should render
      expect(screen.getByText(/Staking & payouts/i)).toBeInTheDocument();
      expect(screen.getByTestId('stake-health-indicator')).toBeInTheDocument();

      // open modal
      const manageBtn = screen.getByRole('button', { name: /manage staking/i });
      expect(manageBtn).toBeInTheDocument();
      fireEvent.click(manageBtn);

      // modal should show provider staking + pending payouts (mocked)
      expect(await screen.findByTestId('provider-staking-panel')).toBeInTheDocument();
      expect(screen.getByTestId('pending-payouts-panel')).toBeInTheDocument();
    });

    test("does not render staking controls for SSO users", () => {
      mockUserData.isSSO = true;
      renderWithClient(<ProviderDashboard />);

      // compact card and manage button should NOT be present for SSO users
      expect(screen.queryByText(/Staking & payouts/i)).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /manage staking/i })).not.toBeInTheDocument();
    });

    test("renders labs in the list", async () => {
      mockLabsData.data = {
        labs: [
          { id: "1", name: "Biology Lab", listed: true },
          { id: "2", name: "Chemistry Lab", listed: false },
        ],
      };

      renderWithClient(<ProviderDashboard />);

      const labItems = await screen.findByTestId("lab-items");

      expect(within(labItems).getByTestId("lab-name-1")).toHaveTextContent(
        "Biology Lab"
      );
      expect(within(labItems).getByTestId("lab-name-2")).toHaveTextContent(
        "Chemistry Lab"
      );
    });

    test("displays bookings in calendar", async () => {
      mockLabsData.data = {
        labs: [{ id: "1", name: "Test Lab" }],
      };

      mockBookingsData.data = {
        bookings: [
          { id: "b1", start: "1000", end: "2000" },
          { id: "b2", start: "3000", end: "4000" },
        ],
      };

      renderWithClient(<ProviderDashboard />);

      await waitFor(() => {
        expect(screen.getByTestId("booking-count")).toHaveTextContent(
          "2 bookings"
        );
      });
    });
  });

  describe("Lab Selection", () => {
    test("auto-selects first lab on load", async () => {
      mockLabsData.data = {
        labs: [
          { id: "1", name: "First Lab" },
          { id: "2", name: "Second Lab" },
        ],
      };

      renderWithClient(<ProviderDashboard />);

      await waitFor(() => {
        const select = screen.getByTestId("lab-select");
        expect(select.value).toBe("1");
      });
    });

    test("allows manual lab selection", async () => {
      mockLabsData.data = {
        labs: [
          { id: "1", name: "Lab One" },
          { id: "2", name: "Lab Two" },
        ],
      };

      renderWithClient(<ProviderDashboard />);

      const select = await screen.findByTestId("lab-select");

      fireEvent.change(select, { target: { value: "2" } });

      expect(select.value).toBe("2");
    });

    test("handles empty labs list", () => {
      mockLabsData.data = { labs: [] };

      renderWithClient(<ProviderDashboard />);

      expect(screen.getByTestId("labs-list")).toBeInTheDocument();
    });
  });

  describe("Lab CRUD Operations", () => {
    describe("Add Lab", () => {
      test("opens modal for new lab", async () => {
        renderWithClient(<ProviderDashboard />);

        const addButton = screen.getByTestId("add-new-lab");
        fireEvent.click(addButton);

        expect(await screen.findByTestId("lab-modal")).toBeInTheDocument();
        expect(screen.getByTestId("modal-lab-id")).toHaveTextContent("new");
      });

      test("creates new lab successfully", async () => {
        mockAddLabMutate.mockResolvedValueOnce({
          labId: "3",
          success: true,
        });

        mockSaveLabDataMutate.mockResolvedValueOnce({ success: true });

        renderWithClient(<ProviderDashboard />);

        const addButton = screen.getByTestId("add-new-lab");
        fireEvent.click(addButton);

        const submitButton = await screen.findByTestId("modal-submit");

        await act(async () => {
          fireEvent.click(submitButton);
        });

        await waitFor(() => {
          expect(mockAddLabMutate).toHaveBeenCalled();
          expect(mockAddNotification).toHaveBeenCalledWith(
            "pending",
            expect.stringContaining("Confirm"),
            expect.objectContaining({ autoHide: false, category: "lab-create" })
          );
        });
      });

      test("handles lab creation with temp files", async () => {
        mockAddLabMutate.mockResolvedValueOnce({
          labId: "5",
          success: true,
        });

        mockMoveFilesMutate.mockResolvedValueOnce({
          movedFiles: [
            {
              original: "/temp/images/photo.jpg",
              new: "/labs/5/images/photo.jpg",
            },
          ],
        });

        mockSaveLabDataMutate.mockResolvedValueOnce({ success: true });

        renderWithClient(<ProviderDashboard />);

        const addButton = screen.getByTestId("add-new-lab");
        fireEvent.click(addButton);

        const submitButton = await screen.findByTestId("modal-submit");

        await act(async () => {
          fireEvent.click(submitButton);
        });

        await waitFor(() => {
          expect(mockAddLabMutate).toHaveBeenCalled();
        });
      });

      test("handles lab creation error", async () => {
        const error = new Error("Network error");
        mockAddLabMutate.mockRejectedValueOnce(error);

        renderWithClient(<ProviderDashboard />);

        const addButton = screen.getByTestId("add-new-lab");
        fireEvent.click(addButton);

        const submitButton = await screen.findByTestId("modal-submit");

        await act(async () => {
          fireEvent.click(submitButton);
        });

        await waitFor(() => {
          expectTempNotificationCall(
            "error",
            expect.stringContaining("Failed to add lab")
          );
        });
      });
    });

    describe("Edit Lab", () => {
      beforeEach(() => {
        mockLabsData.data = {
          labs: [
            {
              id: "1",
              name: "Original Lab",
              uri: "Lab-Provider-1.json",
              price: "100",
              auth: "basic",
              accessURI: "https://lab.com",
              accessKey: "key123",
            },
          ],
        };
      });

      test("opens modal with selected lab data", async () => {
        renderWithClient(<ProviderDashboard />);

        await waitFor(() => {
          const editButton = screen.getByTestId("edit-1");
          fireEvent.click(editButton);
        });

        expect(await screen.findByTestId("lab-modal")).toBeInTheDocument();
        expect(screen.getByTestId("modal-lab-id")).toHaveTextContent("1");
      });

      test("triggers update mutation when submitting edit", async () => {
        mockUpdateLabMutate.mockResolvedValueOnce({ success: true });
        mockSaveLabDataMutate.mockResolvedValueOnce({ success: true });

        renderWithClient(<ProviderDashboard />);

        await waitFor(() => {
          const editButton = screen.getByTestId("edit-1");
          fireEvent.click(editButton);
        });

        const submitButton = await screen.findByTestId("modal-submit");

        await act(async () => {
          fireEvent.click(submitButton);
        });

        await waitFor(() => {
          // Ensure optimistic editing was set and then cleared
          expect(mockSetOptimisticLabState).toHaveBeenCalledWith("1", expect.objectContaining({ editing: true, isPending: true }));
          expect(mockClearOptimisticLabState).toHaveBeenCalledWith("1");
        });
      });

      test("handles edit error", async () => {
        const error = new Error("Update failed");
        mockUpdateLabMutate.mockRejectedValueOnce(error);

        renderWithClient(<ProviderDashboard />);

        await waitFor(() => {
          const editButton = screen.getByTestId("edit-1");
          fireEvent.click(editButton);
        });

        const submitButton = await screen.findByTestId("modal-submit");

        await act(async () => {
          fireEvent.click(submitButton);
        });

        await waitFor(() => {
          expect(mockUpdateLabMutate).toHaveBeenCalled();
          expectTempNotificationCall("error", expect.stringContaining("Failed"));
        });
      });
    });

    describe("Delete Lab", () => {
      beforeEach(() => {
        mockLabsData.data = {
          labs: [{ id: "1", name: "Lab to Delete" }],
        };
      });

      test("deletes lab successfully", async () => {
        mockDeleteLabMutate.mockResolvedValueOnce({ success: true });

        renderWithClient(<ProviderDashboard />);

        const deleteButton = await screen.findByTestId("delete-1");

        await act(async () => {
          fireEvent.click(deleteButton);
        });

        await waitFor(() => {
          expect(mockDeleteLabMutate).toHaveBeenCalledWith("1");
          expectTempNotificationCall("pending", "Deleting lab...");
          expectTempNotificationCall("success", expect.stringContaining("Lab deleted"));
          // Ensure optimistic deleting state was set and then cleared
          expect(mockSetOptimisticLabState).toHaveBeenCalledWith("1", expect.objectContaining({ deleting: true, isPending: true }));
          expect(mockClearOptimisticLabState).toHaveBeenCalledWith("1");
        });
      });

      test("passes backendUrl in SSO delete payload", async () => {
        mockUserData.isSSO = true;
        mockUserData.institutionBackendUrl = "https://institution.example";
        mockDeleteLabMutate.mockResolvedValueOnce({ success: true });

        renderWithClient(<ProviderDashboard />);

        const deleteButton = await screen.findByTestId("delete-1");

        await act(async () => {
          fireEvent.click(deleteButton);
        });

        await waitFor(() => {
          expect(mockDeleteLabMutate).toHaveBeenCalledWith({
            labId: "1",
            backendUrl: "https://institution.example",
          });
        });
      });

      test("handles delete error", async () => {
        const error = new Error("Delete failed");
        mockDeleteLabMutate.mockRejectedValueOnce(error);

        renderWithClient(<ProviderDashboard />);

        const deleteButton = await screen.findByTestId("delete-1");

        await act(async () => {
          fireEvent.click(deleteButton);
        });

        await waitFor(() => {
          expectTempNotificationCall(
            "error",
            expect.stringContaining("Failed to delete lab")
          );
        });
      });
    });

    describe("List/Unlist Lab", () => {
      test("lists unlisted lab", async () => {
        mockLabsData.data = {
          labs: [{ id: "1", name: "Unlisted Lab", listed: false }],
        };

        mockListLabMutate.mockResolvedValueOnce({ success: true });

        renderWithClient(<ProviderDashboard />);

        const listButton = await screen.findByTestId("list-1");

        await act(async () => {
          fireEvent.click(listButton);
        });

        await waitFor(() => {
          // Ensure user receives immediate feedback
          expectTempNotificationCall(
            "pending",
            expect.stringContaining("Sending listing request")
          );

          // Mutation should be executed
          expect(mockListLabMutate).toHaveBeenCalledWith("1");

          // And finally success notification
          expectTempNotificationCall("success", expect.stringContaining("Lab listed successfully"));

          // Optimistic state was set before mutation
          expect(mockSetOptimisticListingState).toHaveBeenCalledWith("1", true, true);
          // On success it was completed
          expect(mockCompleteOptimisticListingState).toHaveBeenCalledWith("1");
        });
      });

      test("unlists listed lab", async () => {
        mockLabsData.data = {
          labs: [{ id: "1", name: "Listed Lab", listed: true }],
        };

        mockUnlistLabMutate.mockResolvedValueOnce({ success: true });

        renderWithClient(<ProviderDashboard />);

        const unlistButton = await screen.findByTestId("unlist-1");

        await act(async () => {
          fireEvent.click(unlistButton);
        });

      await waitFor(() => {
        expect(mockUnlistLabMutate).toHaveBeenCalledWith("1");
        expect(mockAddNotification).toHaveBeenCalledWith(
          "pending",
          "Unlisting lab...",
          expect.objectContaining({ autoHide: false, category: "lab-listing" })
        );
      });
    });

      test("handles list error", async () => {
        mockLabsData.data = {
          labs: [{ id: "1", name: "Lab", listed: false }],
        };

        const error = new Error("List failed");
        mockListLabMutate.mockRejectedValueOnce(error);

        renderWithClient(<ProviderDashboard />);

        const listButton = await screen.findByTestId("list-1");

        await act(async () => {
          fireEvent.click(listButton);
        });

        await waitFor(() => {
          expectTempNotificationCall(
            "error",
            expect.stringContaining("Failed to list lab")
          );
        });
      });
    });
  });

  describe("Funds Collection", () => {
    test("hides Collect button for SSO users", () => {
      mockUserData.isSSO = true;

      renderWithClient(<ProviderDashboard />);

      expect(screen.queryByTestId("collect")).not.toBeInTheDocument();
    });

    test("collects selected lab balance successfully", async () => {
      mockLabsData.data = {
        labs: [{ id: "1", name: "Lab 1", listed: true }],
      };
      mockRequestFundsMutate.mockResolvedValueOnce({ success: true });

      renderWithClient(<ProviderDashboard />);

      const collectButton = screen.getByTestId("collect");

      await act(async () => {
        fireEvent.click(collectButton);
      });

      await waitFor(() => {
        expect(mockRequestFundsMutate).toHaveBeenCalled();
        expectTempNotificationCall("pending", "Collecting all balances...");
        expectTempNotificationCall("success", expect.stringContaining("Balance collected"));
      });
    });

    test("disables collect when selected lab has no pending payout", async () => {
      mockLabsData.data = {
        labs: [{ id: "1", name: "Lab 1", listed: true }],
      };
      mockSelectedLabPendingPayout = {
        data: { walletPayout: "0", institutionalPayout: "0", totalPayout: "0", institutionalCollectorCount: 0 },
        isLoading: false,
        isError: false,
      };

      renderWithClient(<ProviderDashboard />);

      const collectButton = await screen.findByTestId("collect");
      expect(collectButton).toBeDisabled();

      await act(async () => {
        fireEvent.click(collectButton);
      });

      expect(mockRequestFundsMutate).not.toHaveBeenCalled();
    });

    test("handles collection error", async () => {
      mockLabsData.data = {
        labs: [{ id: "1", name: "Lab 1", listed: true }],
      };
      const error = new Error("Collection failed");
      mockRequestFundsMutate.mockRejectedValueOnce(error);

      renderWithClient(<ProviderDashboard />);

      const collectButton = screen.getByTestId("collect");

      await act(async () => {
        fireEvent.click(collectButton);
      });

      await waitFor(() => {
        expectTempNotificationCall(
          "error",
          expect.stringContaining("Failed to collect balances")
        );
      });
    });
  });

  describe("Error Handling", () => {
    test("displays error UI when labs query fails", async () => {
      mockLabsData = {
        data: null,
        isLoading: false,
        isError: true,
        error: { message: "Network error" },
      };

      renderWithClient(<ProviderDashboard />);

      expect(
        await screen.findByText(/Error Loading Labs/i)
      ).toBeInTheDocument();
      expect(screen.getByText(/Network error/i)).toBeInTheDocument();
    });

    test("shows retry button on error", async () => {
      mockLabsData.isError = true;
      mockLabsData.error = { message: "Failed" };

      renderWithClient(<ProviderDashboard />);

      const retryButton = await screen.findByRole("button", { name: /retry/i });
      expect(retryButton).toBeInTheDocument();
    });

    test("handles missing error message gracefully", async () => {
      mockLabsData = {
        data: null,
        isLoading: false,
        isError: true,
        error: null,
      };

      renderWithClient(<ProviderDashboard />);

      expect(
        await screen.findByText(/Error Loading Labs/i)
      ).toBeInTheDocument();
      expect(
        screen.getByText(/Failed to load laboratory data/i)
      ).toBeInTheDocument();
    });
  });

  describe("Edge Cases", () => {
    test("handles labs without IDs", async () => {
      mockLabsData.data = {
        labs: [{ name: "Lab Without ID" }],
      };

      renderWithClient(<ProviderDashboard />);

      const labItems = await screen.findByTestId("lab-items");
      expect(within(labItems).getByText("Lab Without ID")).toBeInTheDocument();
    });

    test("handles null labs data", () => {
      mockLabsData.data = null;

      renderWithClient(<ProviderDashboard />);

      expect(screen.getByTestId("labs-list")).toBeInTheDocument();
    });

    test("handles undefined labs array", () => {
      mockLabsData.data = { labs: undefined };

      renderWithClient(<ProviderDashboard />);

      expect(screen.getByTestId("labs-list")).toBeInTheDocument();
    });

    test("closes modal after successful submission", async () => {
      mockAddLabMutate.mockResolvedValueOnce({ labId: "10", success: true });
      mockSaveLabDataMutate.mockResolvedValueOnce({ success: true });

      renderWithClient(<ProviderDashboard />);

      const addButton = screen.getByTestId("add-new-lab");
      fireEvent.click(addButton);

      const submitButton = await screen.findByTestId("modal-submit");

      await act(async () => {
        fireEvent.click(submitButton);
      });

      await waitFor(
        () => {
          expect(screen.queryByTestId("lab-modal")).not.toBeInTheDocument();
        },
        { timeout: 1000 }
      );
    });

    test("handles calendar date change", async () => {
      renderWithClient(<ProviderDashboard />);

      const calendar = screen.getByTestId("calendar");
      const dateButton = calendar.querySelector("button");

      fireEvent.click(dateButton);

      expect(calendar).toBeInTheDocument();
    });
  });
});

