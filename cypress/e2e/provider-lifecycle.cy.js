/**
 * Provider Lifecycle E2E Tests
 * 
 * Verifies the dashboard routing for recognized providers,
 * the lab onboarding structure, and UI layout persistence.
 */

describe("Provider Dashboard & Lab Lifecycle", () => {
  beforeEach(() => {
    // Clear cookies and local storage before each test
    cy.clearCookies();
    cy.clearLocalStorage();
    cy.mockLabApis();

    cy.intercept("GET", "/api/onboarding/session*", {
      statusCode: 200,
      body: {
        meta: { stableUserId: "mock-provider-uuid" }
      }
    }).as("onboardingSession");

    // 1. Mock the SSO Auth Session for an active provider user
    cy.intercept("GET", "/api/auth/sso/session*", {
      statusCode: 200,
      body: {
        user: { 
          nameID: "provider@decentralabs.com",
          name: "Mock Provider Corp", 
          email: "provider@decentralabs.com",
          institutionName: "Decentralabs Test Institution",
          affiliation: "decentralabs.com",
          role: "faculty",
          scopedRole: "faculty",
          isProvider: true
        },
        isSSO: true
      }
    }).as("getProviderSession");

    // 2. Mock Contract validations returning 'isLabProvider = true'
    cy.intercept("GET", "/api/contract/provider/isLabProvider*", {
      statusCode: 200,
      body: { isLabProvider: true, isProvider: true }
    }).as("checkProvider");

    // 3. Mock Institutional Context
    cy.intercept("GET", "/api/contract/institution/resolve*", {
      statusCode: 200,
      body: {
        registered: true,
        wallet: "0xprovider567890123456789012345678901234567890",
        backendUrl: "https://backend.example.test",
      },
    }).as("resolveInstitution");

    // 4. Mock IPFS asset submission logic
    cy.intercept("POST", "/api/provider/saveLabData", {
      statusCode: 200,
      body: { success: true, uri: "mock_ipfs_hash_123" }
    }).as("mockIpfsUpload");
  });

  it("handles lab creation forms without crashing and validates form presence", () => {
      // Visit the dashboard root since the form is a React modal
      cy.visit("/providerdashboard", { failOnStatusCode: false });

      // Explicitly block Cypress execution until Next.js has resolved the SSO session
      // Otherwise `AccessControl.js` throws the user to `/` before hydration completes.
      cy.wait("@getProviderSession");
      cy.wait("@resolveInstitution");
      cy.wait("@onboardingSession");

      // Click the UI button to mount the creation form context, forcing it in case of CSS overlays
      cy.contains("button", "Add New Lab").should("exist").click({ force: true });

      // The LabModal component does not natively use a <form> tag, it uses contextual <div> containers.
      // Asserting against the specific React Tabs guarantees the modal has painted onto the Client.
      cy.contains("button", "Full Setup").should("be.visible");
      cy.contains("button", "Quick Setup").should("be.visible");
  });
});
