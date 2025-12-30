/**
 * Labs dataset for testing components and API mocks
 */
export const mockLabs = [
  {
    id: 1,
    labId: 1,
    name: "Electronics Lab",
    description: "Advanced electronics laboratory",
    category: "Electronics",
    keywords: ["electronics", "testing", "hardware"],
    price: "0.1",
    auth: "https://auth.example.com/auth",
    accessURI: "https://lab1.example.com",
    accessKey: "access-key-lab1",
    opens: 1704067200,
    closes: 1767139200,
    timeSlots: ["30", "60", "120"],
    availableDays: ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"],
    availableHours: {
      start: "08:00",
      end: "18:00",
    },
    maxConcurrentUsers: 10,
    termsOfUse: {
      effectiveDate: 1704067200,
      url: "https://example.com/terms-lab1.pdf",
      version: "1.0",
      sha256: "",
    },
    unavailableWindows: [],
    images: ["/labs/lab_1.jpg"],
    docs: [],
    uri: "",
    available: true,
    provider: "0x123...",
  },
  {
    id: 2,
    labId: 2,
    name: "Robotics Lab",
    description: "Robotics and automation lab",
    category: "Robotics",
    keywords: ["robotics", "automation", "ai"],
    price: "0.2",
    auth: "https://auth.example.com/auth",
    accessURI: "https://lab2.example.com",
    accessKey: "access-key-lab2",
    opens: 1706745600,
    closes: 1767139200,
    timeSlots: ["60", "120"],
    availableDays: ["MONDAY", "WEDNESDAY", "FRIDAY"],
    availableHours: {
      start: "09:00",
      end: "17:00",
    },
    maxConcurrentUsers: 5,
    termsOfUse: {
      effectiveDate: 1706745600,
      url: "https://example.com/terms-lab2.pdf",
      version: "1.0",
      sha256: "",
    },
    unavailableWindows: [],
    images: ["/labs/lab_2.jpg"],
    docs: [],
    uri: "",
    available: false,
    provider: "0x456...",
  },
];

// Example user object for testing user-related flows
export const mockUser = {
  address: "0x789...",
  balance: "10.5",
  reservations: [],
};
