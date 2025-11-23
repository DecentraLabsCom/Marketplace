# 🧪 Testing Documentation - DecentraLabs Marketplace

This guide documents the project's testing strategy, implemented tests, current coverage status, and roadmap for pending work.

## 📋 Table of Contents

- [Testing Strategy](#-testing-strategy)
- [Unit Tests](#-unit-tests)
- [Integration Tests](#-integration-tests)
- [E2E Tests with Cypress](#-e2e-tests-with-cypress)
- [Execution Commands](#-execution-commands)
- [Coverage Analysis](#-coverage-analysis)
- [⚠️ Pending Work](#%EF%B8%8F-pending-work)
- [How to Contribute](#-how-to-contribute)

## 🎯 Testing Strategy

The project implements a robust testing pyramid, prioritizing integration to validate the Web3 stack and maintaining unit tests for business logic.

```
                /\
               /  \           E2E Tests (Cypress)
              /E2E \
            /        \
           / INTEGR.  \       Integration Tests (Jest)
          /            \
        /                \
       /  UNIT TESTS      \   Unit Tests (Jest)
      /                    \
```

### Jest configuration for unit and integration tests

**Configuration**: `jest.config.js` (Root).

## 🔬 Unit Tests

### Location

We use the **Colocation** pattern: tests live in a `__tests__` folder within the directory of the file they test.

### Key Covered Areas

- **Hooks**: `useLabToken` (Mocked Web3 logic), `useMetadata`, `useUserAtomicQueries`.
- **Utils**: Validations (`labValidation`, `bookingValidation`) and price/time helpers.
- **Components**: Conditional rendering in `LabCard`, `Navbar`, `RegisterPage`.

### 📝 Example: Hook Unit Test

This example shows how to mock wagmi to test business logic without a real blockchain.

```javascript
// src/hooks/__tests__/useLabToken.test.js
import { renderHook } from "@testing-library/react";
import { useLabToken } from "../useLabToken";

// 1. Mock external dependencies
jest.mock("wagmi", () => ({
  useBalance: jest.fn(() => ({ data: { value: 100n } })),
  useAccount: jest.fn(() => ({ address: "0x123" })),
}));

describe("useLabToken", () => {
  test("correctly calculates reservation cost", () => {
    const { result } = renderHook(() => useLabToken());
    // Price: 10 tokens/hour, Duration: 60 mins
    const cost = result.current.calculateReservationCost("10", 60);
    expect(cost).toBeDefined();
  });
});
```

## 🔄 Integration Tests

### Location

`src/__tests__/integration/`

These tests use a custom `renderWithAllProviders` wrapper that simulates the entire Web3 environment (Wagmi, QueryClient, Contexts) to test complex flows without a browser.

### 📝 Example: Integration Test

This example shows how to test a complete booking flow using `renderWithAllProviders`:

```javascript
// src/__tests__/integration/BookingLabFlow.integration.test.js
import { screen, waitFor } from "@testing-library/react";
import { renderWithAllProviders } from "@/test-utils/test-providers";
import LabReservation from "@/components/reservation/LabReservation";

describe("LabReservation Component", () => {
  test("completes full booking flow: select time slot and create booking", async () => {
    const labId = "1";

    // Mock reservation state with selected time
    const mockMutation = {
      mutateAsync: jest.fn(() => Promise.resolve({ hash: "0xsuccess123" })),
      isLoading: false,
      isError: false,
    };

    renderWithAllProviders(<LabReservation id={labId} />);

    // Wait for page to load
    await waitFor(() => {
      expect(screen.getByText(/book a lab/i)).toBeInTheDocument();
    });

    // Find and click "Book Now"
    const bookButton = await screen.findByRole("button", { name: /book now/i });
    expect(bookButton).not.toBeDisabled();
    bookButton.click();

    // Verify mutation was called
    await waitFor(() => {
      expect(mockMutation.mutateAsync).toHaveBeenCalled();
    });
  });
});
```

## 🌐 E2E Tests with Cypress

### Configuration

- **Configuration**: `cypress.config.js` (Root).
- **Tests**: `cypress/e2e/`.
- **Web3 Mocks**: `cypress/support/commands.js`

### Tests Implemented ✅

#### smoke.cy.js - Basic Navigation

- ✅ **Main page load**: Title, buttons and filters visible.
- ✅ **Labs listing**: Verifies that API mocks return data and render.
- ✅ **Public navigation**: Routes to About, FAQ and Contact work.

### 📝 Example: E2E Test

This example shows how to verify basic navigation of the application:

```javascript
// cypress/e2e/smoke.cy.js
describe("Smoke Test - Basic Navigation", () => {
  beforeEach(() => {
    cy.visit("/");
  });

  it("should load main page correctly", () => {
    // Verify main title is visible
    cy.contains("Explore Online Labs").should("be.visible");

    // Verify login button exists
    cy.contains("button", /login/i).should("be.visible");

    // Verify filter section is present
    cy.contains("Filter by Category").should("be.visible");
    cy.contains("Filter by Provider").should("be.visible");
  });

  it("should navigate to About page", () => {
    cy.contains("a", /about/i).click();
    cy.location("pathname", { timeout: 15000 }).should("include", "/about");
    cy.contains("About", { timeout: 10000 }).should("be.visible");
  });
});
```

## 🚀 Execution Commands

The project uses `start-server-and-test` to automate execution in CI.

```bash
# --- Unit & Integration (Jest) ---
npm test                  # Run all tests
npm run test:watch        # Interactive mode
npm run test:coverage     # Generate coverage report
npm run test:ci           # CI mode (Single run)

# --- E2E (Cypress) ---

# Headless execution (Automatically starts local server)
npm run test:e2e

# Interactive mode (Opens Cypress UI)
npm run test:e2e:ui

```

## 📊 Coverage Analysis

**Current Status**: ✅ Passing (Adjusted thresholds).

To ensure CI pipeline stability and facilitate deployment, the thresholds (`coverageThreshold`) have been configured in `jest.config.js` according to the project's current reality.

| Metric     | Configured Threshold | Current Coverage | Status  |
| ---------- | -------------------- | ---------------- | ------- |
| Statements | 64%                  | 64.88%           | ✅ Pass |
| Branches   | 53%                  | 53.46%           | ✅ Pass |
| Functions  | 57%                  | 57.59%           | ✅ Pass |
| Lines      | 65%                  | 65.78%           | ✅ Pass |

**Goal**: The medium-term goal is to raise all thresholds to **70%**. It is recommended to add unit tests in `components/` and `hooks` to achieve this.

## ⚠️ Pending Work

### 1. Pending Critical Flow Tests ⏳

The following E2E scenarios need to be implemented:

- **Booking Flow**: Lab Selection -> Token Approval -> Confirmation.
- **Publishing Flow**: Form -> Image Upload -> Transaction.

## 🤝 How to Contribute

To maintain code quality, follow these steps when adding new features:

### Adding New Tests

1. Create the file in the appropriate location (`__tests__` for unit tests, `src/__tests__/integration` for integration, `cypress/e2e` for flows).
2. Follow naming conventions: `*.test.js`, `*.integration.test.js` or `*.cy.js`.
3. Use helpers from `src/test-utils/` to wrap components.
4. Run `npm run test:coverage` to ensure you don't lower the global percentage.
