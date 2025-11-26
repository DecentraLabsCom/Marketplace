/**
 * Test fixtures for lab data
 * Provides complete, valid lab data for tests
 */

/**
 * Creates a complete valid lab data object for Full Setup mode
 * All fields are populated with valid values that pass validation
 *
 * @param {Object} overrides - Fields to override in the default data
 * @returns {Object} Complete lab data object
 */
export const createValidLabFormData = (overrides = {}) => ({
  name: "Test Electronics Lab",
  category: "electronics",
  keywords: ["testing", "electronics", "lab"],
  description: "A laboratory for electronics testing and prototyping",
  price: "0.5",
  auth: "https://auth.example.com",
  accessURI: "https://lab.example.com",
  accessKey: "secret-key-123",
  opens: 1735689600,
  closes: 1767139200,
  timeSlots: ["60", "120"],
  availableDays: ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"],
  availableHours: {
    start: "09:00",
    end: "17:00",
  },
  maxConcurrentUsers: 5,
  termsOfUse: {
    effectiveDate: "01/01/2025",
    url: "https://example.com/terms-v1.0.pdf",
    version: "1.0",
    sha256: "",
  },
  unavailableWindows: [],
  images: [],
  docs: [],
  uri: "",
  ...overrides,
});

/**
 * Creates valid lab data for Quick Setup mode
 * Only includes fields required for quick setup
 *
 * @param {Object} overrides - Fields to override
 * @returns {Object} Quick setup lab data
 */
export const createValidQuickSetupData = (overrides = {}) => ({
  price: "0.5",
  auth: "https://auth.example.com",
  accessURI: "https://lab.example.com",
  accessKey: "quick-key-456",
  uri: "https://metadata.example.com/lab.json",
  ...overrides,
});

/**
 * Creates an existing lab object (as returned from API)
 *
 * @param {Object} overrides - Fields to override
 * @returns {Object} Existing lab object with id
 */
export const createExistingLab = (overrides = {}) => ({
  id: 1,
  labId: 1,
  ...createValidLabFormData(),
  name: "AI Research Lab",
  category: "ai",
  ...overrides,
});
