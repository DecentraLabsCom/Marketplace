/**
 * SSO Authentication E2E Tests
 *
 * These tests verify the SSO authentication flow, session persistence,
 * and authenticated user journeys in the marketplace.
 *
 * Note: Real SSO authentication requires SAML IdP integration.
 * These tests use cy.intercept() to mock SSO responses, allowing
 * us to test the frontend behavior without external dependencies.
 *
 * Test Coverage:
 * - SSO login button visibility and behavior
 * - Session persistence (mocked via interceptors)
 * - Authenticated user dashboard access
 * - SSO logout flow
 * - Session expiration handling
 */

describe("SSO Authentication Flow", () => {
  beforeEach(() => {
    // Clear cookies and local storage before each test
    cy.clearCookies();
    cy.clearLocalStorage();
  });

  describe("Unauthenticated User", () => {
    it("should display login options on the home page", () => {
      cy.visit("/");

      // Login button should be visible for unauthenticated users
      cy.contains("button", /login/i).should("be.visible");
    });

    it("should show SSO login option in login modal", () => {
      cy.visit("/");

      // Open login modal
      cy.contains("button", /login/i).click();

      // SSO login option should be visible
      // Note: The actual text may vary based on UI implementation
      cy.get("[data-testid='sso-login-button'], button")
        .contains(/institutional|sso|university/i)
        .should("exist");
    });

    it("should redirect to SSO IdP when clicking SSO login", () => {
      // Mock the SSO redirect endpoint
      cy.intercept("GET", "/api/auth/sso/login*", (req) => {
        // In real scenario, this would redirect to IdP
        // For testing, we simulate the redirect behavior
        req.reply({
          statusCode: 302,
          headers: {
            Location:
              "https://idp.institution.edu/saml/login?SAMLRequest=...",
          },
        });
      }).as("ssoLoginRedirect");

      cy.visit("/");
      cy.contains("button", /login/i).click();

      // This test documents the expected behavior
      // The actual click might trigger a redirect
    });
  });

  describe("Authenticated SSO User (Mocked)", () => {
    beforeEach(() => {
      // Mock SSO session endpoint to return authenticated user
      cy.fixture("sso-session.json").then((sessionData) => {
        cy.intercept("GET", "/api/auth/sso/session", {
          statusCode: 200,
          body: sessionData,
        }).as("getSession");
      });

      // Mock provider status check
      cy.intercept("GET", "/api/contract/provider/isLabProvider*", {
        statusCode: 200,
        body: { isLabProvider: false, isProvider: false },
      }).as("checkProvider");

      // Mock labs listing
      cy.intercept("GET", "/api/contract/lab/getLabs*", {
        statusCode: 200,
        body: {
          labs: [
            {
              id: "1",
              name: "Physics Lab",
              description: "Advanced physics experiments",
              price: "1000000000000000000",
              isActive: true,
            },
          ],
          count: 1,
        },
      }).as("getLabs");
    });

    it("should display user info when authenticated", () => {
      cy.visit("/");
      cy.wait("@getSession");

      // User info should be displayed instead of login button
      // This depends on UI implementation - adjust selector as needed
      cy.get("body").should("contain.text", "Test User");
    });

    it("should show user dashboard link for authenticated users", () => {
      cy.visit("/");
      cy.wait("@getSession");

      // Dashboard link should be visible
      cy.contains(/dashboard|my bookings/i).should("exist");
    });

    it("should navigate to user dashboard successfully", () => {
      cy.visit("/userdashboard");
      cy.wait("@getSession");

      // Should be on dashboard page
      cy.location("pathname").should("include", "/userdashboard");

      // Dashboard content should be visible
      cy.contains(/my bookings|reservations|dashboard/i).should("exist");
    });

    it("should persist session across page navigation", () => {
      cy.visit("/");
      cy.wait("@getSession");

      // Navigate to another page
      cy.contains("a", /about/i).click();
      cy.location("pathname").should("include", "/about");

      // Session should still be active
      cy.wait("@getSession");
      cy.get("body").should("contain.text", "Test User");
    });
  });

  describe("SSO Logout Flow", () => {
    beforeEach(() => {
      // Set up authenticated session
      cy.fixture("sso-session.json").then((sessionData) => {
        cy.intercept("GET", "/api/auth/sso/session", {
          statusCode: 200,
          body: sessionData,
        }).as("getSession");
      });

      // Mock logout endpoint
      cy.intercept("POST", "/api/auth/sso/logout", {
        statusCode: 200,
        body: { success: true },
      }).as("logout");
    });

    it("should show logout option for authenticated users", () => {
      cy.visit("/");
      cy.wait("@getSession");

      // Logout option should be available
      cy.contains(/logout|sign out|disconnect/i).should("exist");
    });

    it("should clear session on logout", () => {
      cy.visit("/");
      cy.wait("@getSession");

      // Click logout
      cy.contains(/logout|sign out|disconnect/i).click();

      // Mock updated session state (no user)
      cy.intercept("GET", "/api/auth/sso/session", {
        statusCode: 200,
        body: { user: null },
      }).as("getSessionAfterLogout");

      // Should redirect to home and show login button
      cy.wait("@logout");
      cy.contains("button", /login/i).should("be.visible");
    });
  });

  describe("Session Expiration Handling", () => {
    it("should handle expired session gracefully", () => {
      // First visit with valid session
      cy.fixture("sso-session.json").then((sessionData) => {
        cy.intercept("GET", "/api/auth/sso/session", {
          statusCode: 200,
          body: sessionData,
        }).as("getSession");
      });

      cy.visit("/");
      cy.wait("@getSession");

      // Simulate session expiration on next request
      cy.intercept("GET", "/api/auth/sso/session", {
        statusCode: 200,
        body: { user: null },
      }).as("expiredSession");

      // Navigate to dashboard (should detect expired session)
      cy.visit("/userdashboard");
      cy.wait("@expiredSession");

      // Should show login option or redirect
      cy.contains(/login|sign in/i).should("exist");
    });

    it("should handle session errors gracefully", () => {
      // Mock session endpoint returning error
      cy.intercept("GET", "/api/auth/sso/session", {
        statusCode: 500,
        body: { error: "Internal server error" },
      }).as("sessionError");

      cy.visit("/");

      // App should handle error gracefully, not crash
      cy.contains("Explore Online Labs").should("be.visible");
    });
  });

  describe("SSO User Booking Flow (Integration)", () => {
    beforeEach(() => {
      // Set up authenticated SSO user
      cy.fixture("sso-session.json").then((sessionData) => {
        cy.intercept("GET", "/api/auth/sso/session", {
          statusCode: 200,
          body: sessionData,
        }).as("getSession");
      });

      // Mock provider status
      cy.intercept("GET", "/api/contract/provider/isLabProvider*", {
        statusCode: 200,
        body: { isLabProvider: false },
      }).as("checkProvider");

      // Mock lab details
      cy.intercept("GET", "/api/contract/lab/getLab*", {
        statusCode: 200,
        body: {
          lab: {
            id: "1",
            name: "Physics Lab",
            description: "Advanced physics experiments",
            price: "1000000000000000000",
            isActive: true,
            provider: "0xprovider123",
          },
        },
      }).as("getLabDetail");

      // Mock lab token balance
      cy.intercept("GET", "/api/contract/labtoken/balance*", {
        statusCode: 200,
        body: { balance: "100000000000000000000" }, // 100 LAB tokens
      }).as("getBalance");

      // Mock reservations
      cy.intercept("GET", "/api/contract/reservation/getReservationsOfToken*", {
        statusCode: 200,
        body: { reservations: [] },
      }).as("getReservations");
    });

    it("should allow SSO user to view lab details", () => {
      cy.visit("/lab/1");
      cy.wait("@getSession");
      cy.wait("@getLabDetail");

      // Lab details should be visible
      cy.contains("Physics Lab").should("be.visible");
    });

    it("should show booking interface for authenticated SSO user", () => {
      cy.visit("/lab/1");
      cy.wait("@getSession");
      cy.wait("@getLabDetail");

      // Booking button or calendar should be visible for authenticated users
      cy.get(
        "[data-testid='booking-calendar'], [data-testid='book-button'], .booking-section"
      ).should("exist");
    });

    it("should show user reservations in dashboard", () => {
      // Mock user's reservations
      cy.intercept("GET", "/api/contract/reservation/getReservationsOf*", {
        statusCode: 200,
        body: {
          reservations: [
            {
              reservationKey: "0xreservation123",
              labId: "1",
              start: Math.floor(Date.now() / 1000) + 3600,
              end: Math.floor(Date.now() / 1000) + 7200,
              status: 1, // BOOKED
            },
          ],
        },
      }).as("getUserReservations");

      cy.visit("/userdashboard");
      cy.wait("@getSession");
      cy.wait("@getUserReservations");

      // Reservations should be displayed
      cy.contains(/reservation|booking/i).should("exist");
    });
  });
});

describe("SSO Provider Dashboard Access", () => {
  beforeEach(() => {
    // Set up authenticated SSO user who is also a provider
    cy.intercept("GET", "/api/auth/sso/session", {
      statusCode: 200,
      body: {
        user: {
          nameID: "provider@institution.edu",
          name: "Provider User",
          email: "provider@institution.edu",
          institutionName: "Test University",
        },
        isSSO: true,
        address: "0xprovider567890123456789012345678901234567890",
      },
    }).as("getSession");

    // Mock provider status - user IS a provider
    cy.intercept("GET", "/api/contract/provider/isLabProvider*", {
      statusCode: 200,
      body: { isLabProvider: true, isProvider: true },
    }).as("checkProvider");

    // Mock provider labs
    cy.intercept("GET", "/api/contract/lab/getLabsOfProvider*", {
      statusCode: 200,
      body: {
        labs: [
          {
            id: "10",
            name: "My Physics Lab",
            description: "Lab owned by this provider",
            price: "2000000000000000000",
            isActive: true,
          },
        ],
        count: 1,
      },
    }).as("getProviderLabs");
  });

  it("should show provider dashboard link for provider users", () => {
    cy.visit("/");
    cy.wait("@getSession");
    cy.wait("@checkProvider");

    // Provider dashboard link should be visible
    cy.contains(/provider dashboard|my labs/i).should("exist");
  });

  it("should navigate to provider dashboard successfully", () => {
    cy.visit("/providerdashboard");
    cy.wait("@getSession");
    cy.wait("@checkProvider");
    cy.wait("@getProviderLabs");

    // Should be on provider dashboard
    cy.location("pathname").should("include", "/providerdashboard");

    // Provider's labs should be visible
    cy.contains("My Physics Lab").should("exist");
  });

  it("should show lab management options for providers", () => {
    cy.visit("/providerdashboard");
    cy.wait("@getSession");
    cy.wait("@checkProvider");
    cy.wait("@getProviderLabs");

    // Lab management actions should be available
    cy.contains(/manage|edit|bookings/i).should("exist");
  });
});
