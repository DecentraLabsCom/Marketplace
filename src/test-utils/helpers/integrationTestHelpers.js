/**
 * Integration Test Helpers
 *
 * Reusable helper functions for common integration test patterns.
 * These reduce boilerplate while maintaining flexibility for custom scenarios.
 *
 * @module integrationTestHelpers
 */

/**
 * Creates a mock reservation state with common defaults
 * Useful for BookingLabFlow tests to reduce repetitive mock setup
 *
 * @param {Object} overrides - Properties to override default mock state
 * @returns {Object} Complete mock reservation state
 *
 * @example
 * const mockState = createMockReservationState({
 *   selectedTime: "10:00",
 *   availableTimes: [
 *     { value: "10:00", label: "10:00 AM", disabled: false }
 *   ]
 * });
 */
export const createMockReservationState = (overrides = {}) => ({
  date: new Date(),
  duration: 60,
  selectedTime: null,
  isBooking: false,
  forceRefresh: false,
  isClient: true,
  minDate: new Date().toISOString().split("T")[0],
  maxDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    .toISOString()
    .split("T")[0],
  availableTimes: [
    { value: "10:00", label: "10:00 AM", disabled: false },
    { value: "11:00", label: "11:00 AM", disabled: false },
    { value: "14:00", label: "02:00 PM", disabled: false },
  ],
  totalCost: 0.5,
  isWaitingForReceipt: false,
  isReceiptError: false,
  setIsBooking: jest.fn(),
  setLastTxHash: jest.fn(),
  setPendingData: jest.fn(),
  handleDateChange: jest.fn(),
  handleDurationChange: jest.fn(),
  handleTimeChange: jest.fn(),
  handleBookingSuccess: jest.fn(),
  formatPrice: (price) => price,
  reservationRequestMutation: {
    mutateAsync: jest.fn(() => Promise.resolve({ hash: "0xsuccess" })),
    isLoading: false,
    isError: false,
  },
  bookingCacheUpdates: {
    addOptimisticBooking: jest.fn(() => ({ id: "optimistic-1" })),
  },
  ...overrides,
});

/**
 * Creates a mock lab mutation object with common defaults
 * Useful for LabListingFlow and ProviderDashboardFlow tests
 *
 * @param {Object} overrides - Properties to override default mutation
 * @returns {Object} Mock mutation with mutateAsync, isLoading, isError
 *
 * @example
 * const addLabMutation = createMockLabMutation({
 *   mutateAsync: jest.fn(() => Promise.resolve({ labId: 5 }))
 * });
 */
export const createMockLabMutation = (overrides = {}) => ({
  mutateAsync: jest.fn(() =>
    Promise.resolve({
      hash: "0xmockhash",
      labId: 1,
      id: 1,
    })
  ),
  isLoading: false,
  isError: false,
  ...overrides,
});

/**
 * Creates mock context providers with common defaults
 * Reduces repetitive context mock setup across tests
 *
 * @param {Object} overrides - Context values to override
 * @returns {Object} Mock context values
 *
 * @example
 * const contexts = createMockContexts({
 *   user: { isProvider: true }
 * });
 */
export const createMockContexts = (overrides = {}) => ({
  user: {
    isSSO: false,
    address: "0x123",
    isAuthenticated: false,
    isProvider: false,
    isProviderLoading: false,
    ...overrides.user,
  },
  labToken: {
    balance: BigInt("15500000000000000000"),
    allowance: BigInt("10000000000000000000"),
    decimals: 18,
    isLoading: false,
    formatTokenAmount: jest.fn((amount) => "15.50"),
    formatPrice: jest.fn((price) => "0.50"),
    ...overrides.labToken,
  },
  optimisticUI: {
    optimisticData: {},
    addOptimisticData: jest.fn(),
    removeOptimisticData: jest.fn(),
    setOptimisticListingState: jest.fn(),
    clearOptimisticListingState: jest.fn(),
    completeOptimisticListingState: jest.fn(),
    getEffectiveListingState: jest.fn(() => ({
      isListed: false,
      isPending: false,
    })),
    ...overrides.optimisticUI,
  },
});

/**
 * Creates mock wagmi connector objects
 * Useful for WalletConnectionFlow tests
 *
 * @param {string} name - Connector name (e.g., "MetaMask", "WalletConnect")
 * @param {Object} overrides - Properties to override
 * @returns {Object} Mock connector
 *
 * @example
 * const metaMask = createMockConnector("MetaMask", { ready: false });
 */
export const createMockConnector = (name, overrides = {}) => ({
  uid: `${name.toLowerCase()}-connector`,
  name,
  type: name === "WalletConnect" ? "walletConnect" : "injected",
  ready: true,
  getProvider: jest.fn().mockResolvedValue({}),
  ...overrides,
});

/**
 * Creates a mock file object for upload testing
 * Useful for testing file upload functionality
 *
 * @param {Object} options - File properties
 * @returns {File} Mock File object
 *
 * @example
 * const imageFile = createMockFile({
 *   name: "test.jpg",
 *   type: "image/jpeg",
 *   size: 1024 * 100 // 100KB
 * });
 */
export const createMockFile = (options = {}) => {
  const {
    name = "test-file.jpg",
    type = "image/jpeg",
    size = 1024 * 50, // 50KB default
    lastModified = Date.now(),
  } = options;

  const file = new File(["mock content"], name, {
    type,
    lastModified,
  });

  // Override size property (File constructor doesn't accept size)
  Object.defineProperty(file, "size", {
    value: size,
    writable: false,
  });

  return file;
};

/**
 * Waits for a specific number of async updates
 * Useful when testing components with multiple async state updates
 *
 * @param {number} updates - Number of updates to wait for
 * @returns {Promise<void>}
 *
 * @example
 * await waitForUpdates(2); // Wait for 2 re-renders
 */
export const waitForUpdates = async (updates = 1) => {
  for (let i = 0; i < updates; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
};
