/**
 * FMU Provider Flow E2E Tests
 *
 * Verifies the complete provider journey for creating an FMU resource:
 *  - Provider accesses the dashboard
 *  - Opens "Add New Lab" modal
 *  - Selects "FMU Simulation" resource type
 *  - FMU-specific fields appear (filename, auto-detect)
 *  - Auto-detect fetches FMU metadata from gateway
 *  - Submit button reads "Add FMU Simulation"
 *
 * Also covers:
 *  - FMU lab detail page with simulation details section
 *  - "Book Simulation" button navigates to /reservation/:id
 */

const FMU_LAB = {
  id: 10,
  owner: "0xprovider567890123456789012345678901234567890",
  providerName: "Simulation Provider",
  providerEmail: "sim@test.edu",
  providerCountry: "DE",
  uri: "fmu-spring-10.json",
  price: "500000000000000000",
  isListed: true,
  accessKey: "spring-damper.fmu",
  metadata: {
    name: "Spring-Damper Simulation",
    description: "A spring-damper FMU model for testing",
    keywords: ["fmu", "simulation"],
    attributes: [
      { trait_type: "resourceType", value: "fmu" },
      { trait_type: "maxConcurrentUsers", value: 50 },
      { trait_type: "fmiVersion", value: "2.0" },
      { trait_type: "fmuFileName", value: "spring-damper.fmu" },
      { trait_type: "simulationType", value: "CoSimulation" },
      { trait_type: "defaultStartTime", value: 0 },
      { trait_type: "defaultStopTime", value: 10 },
      { trait_type: "defaultStepSize", value: 0.01 },
      {
        trait_type: "modelVariables",
        value: [
          { name: "mass", causality: "input", type: "Real", unit: "kg", start: 1.0, min: 0.1, max: 100 },
          { name: "damping", causality: "input", type: "Real", unit: "N.s/m", start: 0.5 },
          { name: "position", causality: "output", type: "Real", unit: "m" },
          { name: "velocity", causality: "output", type: "Real", unit: "m/s" },
        ],
      },
    ],
  },
};

describe("FMU Provider - Create FMU resource", () => {
  const onboardingStableUserId = "sim-provider@institution.edu";
  const onboardingInstitutionId = "sim.edu";
  const onboardingMarkerKey = `institutional_browser_passkey:${onboardingInstitutionId}:${onboardingStableUserId}`;

  const visitProviderDashboard = () => {
    cy.visit("/providerdashboard", {
      onBeforeLoad(win) {
        win.localStorage.setItem(
          onboardingMarkerKey,
          JSON.stringify({ verifiedAt: Date.now(), advisoryDismissedAt: null })
        );
      },
    });

    cy.wait("@getSession");
    cy.wait("@resolveInstitution");
    cy.wait("@onboardingSession");
  };

  const openAddNewLabModal = () => {
    cy.get("body").then(($body) => {
      const hasOpenDialog = $body.find('[role="dialog"]').length > 0;
      if (!hasOpenDialog) {
        cy.contains("button", "Add New Lab").should("be.visible").click();
      }
    });

    cy.contains("h2", "Add New Lab").should("be.visible");
  };

  beforeEach(() => {
    cy.clearCookies();
    cy.clearLocalStorage();

    // Authenticated provider via SSO
    cy.intercept("GET", "/api/auth/sso/session*", {
      statusCode: 200,
      body: {
        user: {
          nameID: "sim-provider@institution.edu",
          name: "Simulation Provider",
          email: "sim-provider@institution.edu",
          institutionName: "Simulation University",
          affiliation: "sim.edu",
          role: "faculty",
        },
        isSSO: true,
      },
    }).as("getSession");

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

    cy.intercept("GET", "/api/onboarding/session*", {
      statusCode: 200,
      body: {
        meta: {
          stableUserId: onboardingStableUserId,
          institutionId: onboardingInstitutionId,
        },
      },
    }).as("onboardingSession");

    cy.intercept("GET", "**/onboarding/webauthn/key-status/**", {
      statusCode: 200,
      body: {
        hasCredential: true,
        hasPlatformCredential: true,
      },
    }).as("keyStatus");

    cy.intercept("GET", "/api/contract/institution/getInstitutionCreditBalance*", {
      statusCode: 200,
      body: { balance: "0" },
    }).as("getInstitutionCreditBalance");

    cy.intercept("GET", "/api/contract/institution/getUserReservationCount*", {
      statusCode: 200,
      body: { count: 0 },
    }).as("getUserReservationCount");

    cy.intercept("GET", "/api/contract/institution/getUserReservationByIndex*", {
      statusCode: 200,
      body: {
        reservationKey: "0x0000000000000000000000000000000000000000000000000000000000000000",
        index: 0,
      },
    }).as("getUserReservationByIndex");

    cy.intercept("GET", "/api/contract/institution/hasUserActiveBooking*", {
      statusCode: 200,
      body: { hasActiveBooking: false },
    }).as("hasUserActiveBooking");

    cy.mockLabApis([FMU_LAB]);

    cy.intercept("GET", "/api/contract/reservation/getReservationsOfToken*", {
      statusCode: 200,
      body: { count: 0 },
    }).as("getReservationsOfToken");
  });

  it("should open Add New Lab modal and show Resource Type selector", () => {
    visitProviderDashboard();
    openAddNewLabModal();

    // Modal should open
    cy.contains("h2", "Add New Lab").should("be.visible");

    // Resource type selector should be visible
    cy.contains("Resource Type").should("be.visible");
    cy.contains("button", /(remote lab|real lab)/i).should("be.visible");
    cy.contains("button", /(fmu simulation|simulation)/i).should("be.visible");
  });

  it("should show FMU-specific fields when FMU Simulation is selected", () => {
    visitProviderDashboard();
    openAddNewLabModal();

    // Select FMU Simulation
    cy.contains("button", /(fmu simulation|simulation)/i).click();

    // FMU section is rendered below the fold inside a fixed modal: scroll first.
    cy.contains("FMU Configuration").scrollIntoView().should("exist");
    cy.contains("FMU File Name").should("exist");
    cy.get('input[placeholder="spring-damper.fmu"]').scrollIntoView().should("be.visible");
    cy.contains("button", "Auto-detect").scrollIntoView().should("be.visible");

    // Submit button should read "Add FMU Simulation"
    cy.get('button[type="submit"]').should("contain.text", "Add FMU Simulation");
  });

  it("should auto-detect FMU metadata from gateway", () => {
    // Mock the describe API endpoint
    cy.intercept("GET", "/api/simulations/describe*", {
      statusCode: 200,
      body: {
        fmiVersion: "2.0",
        simulationType: "CoSimulation",
        defaultStartTime: 0,
        defaultStopTime: 10,
        defaultStepSize: 0.01,
        modelVariables: [
          { name: "mass", causality: "input", type: "Real", unit: "kg", start: 1.0 },
          { name: "position", causality: "output", type: "Real", unit: "m" },
        ],
      },
    }).as("describeSimulation");

    visitProviderDashboard();
    openAddNewLabModal();
    cy.contains("button", /(fmu simulation|simulation)/i).click();

    // Auto-detect requires both gateway URL (Access URI) and FMU file name.
    cy.get('input[placeholder="Access URI"]').scrollIntoView().clear().type("https://gateway.example.test");
    cy.get('input[placeholder="spring-damper.fmu"]').scrollIntoView().clear().type("test-model.fmu");

    // Click auto-detect
    cy.contains("button", "Auto-detect").should("not.be.disabled").click();
    cy.wait("@describeSimulation");

    // Success message should appear
    cy.contains("FMU metadata loaded successfully").should("be.visible");
  });

  it("should switch back to lab mode and hide FMU fields", () => {
    visitProviderDashboard();
    openAddNewLabModal();

    // Select FMU first
    cy.contains("button", /(fmu simulation|simulation)/i).click();
    cy.contains("FMU Configuration").scrollIntoView().should("exist");

    // Switch back to Remote Lab
    cy.contains("button", /(remote lab|real lab)/i).click();
    cy.contains("FMU Configuration").should("not.exist");

    // Submit button should read "Add Lab"
    cy.get('button[type="submit"]').should("contain.text", "Add Lab");
  });
});

describe("FMU Lab Detail - simulation info and navigation", () => {
  beforeEach(() => {
    cy.clearCookies();
    cy.clearLocalStorage();

    cy.fixture("sso-session.json").then((sessionData) => {
      cy.intercept("GET", "/api/auth/sso/session*", {
        statusCode: 200,
        body: sessionData,
      }).as("getSession");
    });

    cy.intercept("GET", "/api/contract/provider/isLabProvider*", {
      statusCode: 200,
      body: { isLabProvider: false },
    }).as("checkProvider");

    cy.mockLabApis([FMU_LAB]);
  });

  it("should display FMU Simulation Details section", () => {
    cy.visit("/lab/10");
    cy.wait("@getSession");
    cy.wait("@getLab");
    cy.wait("@getMetadata");

    // FMU-specific section should be visible
    cy.contains("FMU Simulation Details").should("be.visible");
    cy.contains("FMI Version").should("be.visible");
    cy.contains("Model Variables").should("be.visible");

    // Variable names should appear in the table
    cy.contains("mass").should("be.visible");
    cy.contains("position").should("be.visible");
  });

  it("should show Book Simulation button instead of Book Lab", () => {
    cy.visit("/lab/10");
    cy.wait("@getSession");
    cy.wait("@getLab");
    cy.wait("@getMetadata");

    // "Book Simulation" instead of "Book Lab"
    cy.contains("button", /book simulation/i).should("be.visible");
    cy.contains("button", /book lab/i).should("not.exist");
  });

  it("should navigate to reservation page when Book Simulation is clicked", () => {
    cy.visit("/lab/10");
    cy.wait("@getSession");
    cy.wait("@getLab");
    cy.wait("@getMetadata");

    cy.contains("button", /book simulation/i).click();
    cy.location("pathname").should("include", "/reservation/10");
  });
});
