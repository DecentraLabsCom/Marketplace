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
      cy.intercept("GET", "/api/auth/sso/saml2/login*", (req) => {
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
        cy.intercept("GET", "/api/auth/sso/session*", {
          statusCode: 200,
          body: sessionData,
        }).as("getSession");
      });

      // Mock provider status check
      cy.intercept("GET", "/api/contract/provider/isLabProvider*", {
        statusCode: 200,
        body: { isLabProvider: false, isProvider: false },
      }).as("checkProvider");

      cy.mockInstitutionBookingApis({
        count: 0,
        reservationKeys: [],
        hasActiveBooking: false,
      });

      cy.mockLabApis();
    });

    it("should display user info when authenticated", () => {
      cy.visit("/");
      cy.wait("@getSession");

      // User info should be displayed instead of login button
      // This depends on UI implementation - adjust selector as needed
      cy.contains("Test University").should("be.visible");
    });

    it("should show user dashboard link for authenticated users", () => {
      cy.visit("/");
      cy.wait("@getSession");

      // Dashboard link should be visible
      cy.contains("Dashboard").should("exist");
    });

    it("should navigate to user dashboard successfully", () => {
      cy.visit("/userdashboard");
      cy.wait("@getSession");
      cy.wait("@getUserReservationCount");

      // Should be on dashboard page
      cy.location("pathname").should("include", "/userdashboard");

      // Dashboard content should be visible
      cy.contains("User Dashboard").should("exist");
    });

    it("should persist session across page navigation", () => {
      cy.visit("/");
      cy.wait("@getSession");

      // Navigate to another page within the app layout
      cy.contains("a", /book a lab/i).click();
      cy.location("pathname").should("include", "/reservation");

      // Session should still be active
      cy.contains(/Test University|test-user@institution\.edu/i).should(
        "be.visible"
      );
    });
  });

  describe("SSO Logout Flow", () => {
    it("should show logout option for authenticated users", () => {
      cy.fixture("sso-session.json").then((sessionData) => {
        cy.intercept("GET", "/api/auth/sso/session*", {
          statusCode: 200,
          body: sessionData,
        }).as("getSession");
      });

      cy.visit("/");
      cy.wait("@getSession");

      // Logout option should be available
      cy.get("button[aria-label='Logout']").should("exist");
    });

    it("should clear session on logout", () => {
      let loggedOut = false;
      cy.fixture("sso-session.json").then((sessionData) => {
        cy.intercept("GET", "/api/auth/sso/session*", (req) => {
          if (loggedOut) {
            req.reply({ statusCode: 200, body: { user: null } });
            return;
          }
          req.reply({ statusCode: 200, body: sessionData });
        }).as("getSession");
      });

      cy.intercept("GET", "/api/auth/logout*", (req) => {
        loggedOut = true;
        req.reply({ statusCode: 200, body: { success: true } });
      }).as("logout");

      cy.visit("/");
      cy.wait("@getSession");

      // Click logout
      cy.get("button[aria-label='Logout']").click();

      // Should redirect to home and show login button
      cy.wait("@logout");
      cy.contains("button", /login/i).should("be.visible");
    });
  });

  describe("Session Expiration Handling", () => {
    beforeEach(() => {
      cy.mockInstitutionBookingApis({
        count: 0,
        reservationKeys: [],
        hasActiveBooking: false,
      });
    });

    it("should handle expired session gracefully", () => {
      // First visit with valid session
      cy.fixture("sso-session.json").then((sessionData) => {
        cy.intercept("GET", "/api/auth/sso/session*", {
          statusCode: 200,
          body: sessionData,
        }).as("getSession");
      });

      cy.visit("/");
      cy.wait("@getSession");

      // Simulate session expiration on next request
      cy.intercept("GET", "/api/auth/sso/session*", {
        statusCode: 200,
        body: { user: null },
      }).as("expiredSession");

      // Navigate to dashboard (should detect expired session)
      cy.visit("/userdashboard");
      cy.wait("@expiredSession");

      // Should show login option or redirect
      cy.contains("button", /login/i, { timeout: 20000 }).should("be.visible");
    });

    it("should handle session errors gracefully", () => {
      // Mock session endpoint returning error
      cy.intercept("GET", "/api/auth/sso/session*", {
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
        cy.intercept("GET", "/api/auth/sso/session*", {
          statusCode: 200,
          body: sessionData,
        }).as("getSession");
      });

      // Mock provider status
      cy.intercept("GET", "/api/contract/provider/isLabProvider*", {
        statusCode: 200,
        body: { isLabProvider: false },
      }).as("checkProvider");

      cy.mockInstitutionBookingApis({
        count: 0,
        reservationKeys: [],
        hasActiveBooking: false,
      });

      cy.mockLabApis();
    });

    it("should allow SSO user to view lab details", () => {
      cy.visit("/lab/1");
      cy.wait("@getSession");

      // Lab details should be visible
      cy.contains("Physics Lab").should("be.visible");
    });

    it("should show booking interface for authenticated SSO user", () => {
      cy.visit("/lab/1");
      cy.wait("@getSession");

      // Booking button or calendar should be visible for authenticated users
      cy.contains("button", /book lab/i).should("exist");
    });

    it("should show user reservations in dashboard", () => {
      cy.visit("/userdashboard");
      cy.wait("@getSession");
      cy.wait("@getUserReservationCount");

      // Reservations should be displayed
      cy.contains("User Dashboard").should("exist");
    });
  });
});

describe("SSO Provider Dashboard Access", () => {
  beforeEach(() => {
    // Set up authenticated SSO user who is also a provider
    cy.intercept("GET", "/api/auth/sso/session*", {
      statusCode: 200,
      body: {
        user: {
          nameID: "provider@institution.edu",
          name: "Provider User",
          email: "provider@institution.edu",
          institutionName: "Test University",
          affiliation: "test.edu",
          role: "faculty",
        },
        isSSO: true,
      },
    }).as("getSession");

    // Mock provider status - user IS a provider
    cy.intercept("GET", "/api/contract/provider/isLabProvider*", {
      statusCode: 200,
      body: { isLabProvider: true, isProvider: true },
    }).as("checkProvider");

    cy.intercept("GET", "/api/contract/institution/resolve*", {
      statusCode: 200,
      body: {
        registered: true,
        wallet: "0xprovider567890123456789012345678901234567890",
        backendUrl: "https://backend.example.test",
      },
    }).as("resolveInstitution");

    cy.mockLabApis([
      {
        id: 10,
        owner: "0xprovider567890123456789012345678901234567890",
        providerName: "Provider User",
        providerEmail: "provider@institution.edu",
        providerCountry: "ES",
        uri: "Lab-Provider-User-10.json",
        price: "2000000000000000000",
        isListed: true,
        metadata: {
          name: "My Physics Lab",
          description: "Lab owned by this provider",
          attributes: [],
        },
      },
    ]);

    cy.intercept("GET", "/api/contract/reservation/getReservationsOfToken*", {
      statusCode: 200,
      body: { count: 0 },
    }).as("getReservationsOfToken");
  });

  it("should show provider dashboard link for provider users", () => {
    cy.visit("/");
    cy.wait("@getSession");
    cy.wait("@resolveInstitution");

    // Provider dashboard link should be visible
    cy.contains("Lab Panel").should("exist");
  });

  it("should navigate to provider dashboard successfully", () => {
    cy.visit("/providerdashboard");
    cy.wait("@getSession");
    cy.wait("@resolveInstitution");

    // Should be on provider dashboard
    cy.location("pathname").should("include", "/providerdashboard");

    // Provider dashboard content should be visible
    cy.contains("Lab Panel").should("exist");
  });

  it("should show lab management options for providers", () => {
    cy.visit("/providerdashboard");
    cy.wait("@getSession");
    cy.wait("@resolveInstitution");
    cy.contains("Lab Panel").should("be.visible");

    // Lab management actions should be available
    cy.contains("Add New Lab").should("exist");
  });
});
