/**
 * Booking Flow E2E Tests
 *
 * These tests verify the complete lab booking flow from selection
 * to confirmation, including token approval and transaction handling.
 *
 * Test Coverage:
 * - Lab selection and details view
 * - Token approval flow (wagmi integration)
 * - Reservation confirmation
 * - Error handling for insufficient funds/gas
 * - Booking history updates
 */

describe("Lab Booking Flow", () => {
  beforeEach(() => {
    // Clear state before each test
    cy.clearCookies();
    cy.clearLocalStorage();

    // Mock authenticated user session
    cy.intercept("GET", "/api/auth/session", {
      statusCode: 200,
      body: {
        user: {
          id: "test-user-id",
          email: "test@university.edu",
          name: "Test User",
          walletAddress: "0x1234567890123456789012345678901234567890"
        },
        authenticated: true
      }
    }).as("getSession");

    // Mock wallet connection (wagmi)
    cy.intercept("GET", "/api/wagmi/config", {
      statusCode: 200,
      body: {
        chains: [{ id: 1, name: "Ethereum" }],
        connectors: [{ id: "metaMask", name: "MetaMask" }]
      }
    }).as("wagmiConfig");

    // Mock available labs
    cy.intercept("GET", "/api/labs*", {
      statusCode: 200,
      body: {
        labs: [
          {
            id: "lab-1",
            name: "Chemistry Lab A",
            description: "Advanced chemistry equipment",
            provider: "University of Test",
            category: "Chemistry",
            pricePerHour: 50,
            currency: "USD",
            availability: [
              { start: "2025-12-27T10:00:00Z", end: "2025-12-27T12:00:00Z" }
            ],
            imageUrl: "/images/lab1.jpg",
            rating: 4.5,
            totalBookings: 25
          }
        ]
      }
    }).as("getLabs");
  });

  describe("Authenticated User Booking Flow", () => {
    it("should complete full booking flow successfully", () => {
      cy.visit("/");

      // Wait for authentication and labs to load
      cy.wait("@getSession");
      cy.wait("@getLabs");

      // Verify user is logged in (no login button visible)
      cy.contains("button", /login/i).should("not.exist");

      // Navigate to labs section
      cy.contains("Explore Online Labs").should("be.visible");
      cy.contains("Listed labs").should("be.visible");

      // Click on a lab card
      cy.contains("Chemistry Lab A").click();

      // Verify lab details page
      cy.location("pathname").should("include", "/labs/lab-1");
      cy.contains("Chemistry Lab A").should("be.visible");
      cy.contains("Advanced chemistry equipment").should("be.visible");
      cy.contains("$50/hour").should("be.visible");

      // Select booking time slot
      cy.contains("Select Time Slot").should("be.visible");
      cy.get("[data-testid='time-slot-2025-12-27T10:00:00Z']").click();

      // Click book button
      cy.contains("button", /book.*lab|reserve/i).click();

      // Verify booking modal appears
      cy.contains("Confirm Booking").should("be.visible");
      cy.contains("Chemistry Lab A").should("be.visible");
      cy.contains("2 hours").should("be.visible"); // Assuming 2-hour slot
      cy.contains("$100").should("be.visible"); // 50 * 2

      // Mock token approval transaction
      cy.intercept("POST", "/api/wagmi/writeContract", (req) => {
        // Simulate successful token approval
        req.reply({
          statusCode: 200,
          body: {
            hash: "0xapproval_tx_hash",
            wait: () => Promise.resolve({ status: 1 })
          }
        });
      }).as("approveTokens");

      // Mock reservation transaction
      cy.intercept("POST", "/api/wagmi/writeContract", (req) => {
        // Check if it's the reservation call (not approval)
        if (req.body.functionName === "reserveLab") {
          req.reply({
            statusCode: 200,
            body: {
              hash: "0xreservation_tx_hash",
              wait: () => Promise.resolve({
                status: 1,
                logs: [{
                  eventName: "LabReserved",
                  args: {
                    reservationId: "123",
                    user: "0x1234567890123456789012345678901234567890",
                    labId: "lab-1"
                  }
                }]
              })
            }
          });
        }
      }).as("reserveLab");

      // Click confirm booking
      cy.contains("button", /confirm.*booking/i).click();

      // Verify approval step
      cy.contains("Approving tokens...").should("be.visible");
      cy.wait("@approveTokens");

      // Verify reservation step
      cy.contains("Creating reservation...").should("be.visible");
      cy.wait("@reserveLab");

      // Verify success message
      cy.contains("Booking confirmed!").should("be.visible");
      cy.contains("Reservation ID: 123").should("be.visible");

      // Verify redirect to bookings page
      cy.location("pathname").should("include", "/bookings");
      cy.contains("Your Bookings").should("be.visible");
      cy.contains("Chemistry Lab A").should("be.visible");
    });

    it("should handle insufficient token balance", () => {
      cy.visit("/labs/lab-1");

      cy.wait("@getSession");

      // Select time slot and attempt booking
      cy.get("[data-testid='time-slot-2025-12-27T10:00:00Z']").click();
      cy.contains("button", /book.*lab/i).click();
      cy.contains("button", /confirm.*booking/i).click();

      // Mock failed approval due to insufficient balance
      cy.intercept("POST", "/api/wagmi/writeContract", {
        statusCode: 200,
        body: {
          hash: "0xfailed_tx_hash",
          wait: () => Promise.reject(new Error("ERC20: transfer amount exceeds balance"))
        }
      }).as("failedApproval");

      cy.wait("@failedApproval");

      // Verify error message
      cy.contains("Insufficient token balance").should("be.visible");
      cy.contains("Please ensure you have enough tokens").should("be.visible");

      // Verify booking modal remains open
      cy.contains("Confirm Booking").should("be.visible");
    });

    it("should handle transaction rejection by user", () => {
      cy.visit("/labs/lab-1");

      cy.wait("@getSession");

      cy.get("[data-testid='time-slot-2025-12-27T10:00:00Z']").click();
      cy.contains("button", /book.*lab/i).click();
      cy.contains("button", /confirm.*booking/i).click();

      // Mock user rejection in wallet
      cy.intercept("POST", "/api/wagmi/writeContract", {
        statusCode: 400,
        body: { error: { code: 4001, message: "User rejected the request" } }
      }).as("userRejected");

      cy.wait("@userRejected");

      // Verify error message
      cy.contains("Transaction cancelled").should("be.visible");
      cy.contains("You cancelled the transaction").should("be.visible");

      // Verify can retry
      cy.contains("button", /try.*again/i).should("be.visible");
    });

    it("should handle network congestion/gas too low", () => {
      cy.visit("/labs/lab-1");

      cy.wait("@getSession");

      cy.get("[data-testid='time-slot-2025-12-27T10:00:00Z']").click();
      cy.contains("button", /book.*lab/i).click();
      cy.contains("button", /confirm.*booking/i).click();

      // Mock network congestion
      cy.intercept("POST", "/api/wagmi/writeContract", {
        statusCode: 200,
        body: {
          hash: "0xslow_tx_hash",
          wait: () => Promise.reject(new Error("Transaction underpriced"))
        }
      }).as("networkCongestion");

      cy.wait("@networkCongestion");

      // Verify error message
      cy.contains("Network congestion").should("be.visible");
      cy.contains("Please try again with higher gas price").should("be.visible");

      // Verify gas adjustment option
      cy.contains("button", /increase.*gas/i).should("be.visible");
    });
  });

  describe("Booking History", () => {
    it("should display user's booking history", () => {
      // Mock user's bookings
      cy.intercept("GET", "/api/bookings", {
        statusCode: 200,
        body: {
          bookings: [
            {
              id: "123",
              labId: "lab-1",
              labName: "Chemistry Lab A",
              startTime: "2025-12-27T10:00:00Z",
              endTime: "2025-12-27T12:00:00Z",
              status: "confirmed",
              totalCost: 100,
              currency: "USD"
            }
          ]
        }
      }).as("getBookings");

      cy.visit("/bookings");

      cy.wait("@getSession");
      cy.wait("@getBookings");

      // Verify booking details
      cy.contains("Your Bookings").should("be.visible");
      cy.contains("Chemistry Lab A").should("be.visible");
      cy.contains("Dec 27, 2025").should("be.visible");
      cy.contains("10:00 - 12:00").should("be.visible");
      cy.contains("$100").should("be.visible");
      cy.contains("Confirmed").should("be.visible");
    });
  });
});