/**
 * Booking Flow E2E Tests
 *
 * Lightweight coverage to ensure reservation UI loads for authenticated users.
 */
describe("Lab Booking Flow", () => {
  const onboardingStableUserId = "test-user@institution.edu";
  const onboardingInstitutionId = "institution.edu";
  const onboardingMarkerKey = `institutional_browser_passkey:${onboardingInstitutionId}:${onboardingStableUserId}`;

  const createBookingLab = () => {
    const opens = new Date();
    opens.setHours(0, 0, 0, 0);
    opens.setDate(opens.getDate() + 1);
    const closes = new Date(opens);
    closes.setDate(closes.getDate() + 30);

    return {
      id: 1,
      owner: "0xprovider1230000000000000000000000000000000000",
      providerName: "Test University",
      providerEmail: "provider@test.edu",
      providerCountry: "ES",
      uri: "Lab-Test-University-1.json",
      price: "1000000000000000000",
      isListed: true,
      opens: Math.floor(opens.getTime() / 1000),
      closes: Math.floor(closes.getTime() / 1000),
      metadata: {
        name: "Physics Lab",
        description: "Advanced physics experiments",
        attributes: [],
      },
    };
  };

  const visitReservation = () => {
    cy.visit("/reservation/1", {
      onBeforeLoad(win) {
        win.localStorage.setItem(
          onboardingMarkerKey,
          JSON.stringify({ verifiedAt: Date.now(), advisoryDismissedAt: null }),
        );
      },
    });
  };

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
      body: { isLabProvider: false, isProvider: false },
    }).as("checkProvider");

    cy.intercept("GET", "/api/contract/institution/resolve*", {
      statusCode: 200,
      body: {
        registered: true,
        wallet: "0x3333333333333333333333333333333333333333",
        backendUrl: "https://institution.example.test",
      },
    }).as("resolveInstitution");

    cy.intercept("GET", "/api/onboarding/webauthn/key-status*", {
      statusCode: 200,
      body: {
        stableUserId: onboardingStableUserId,
        institutionId: onboardingInstitutionId,
        hasCredential: true,
        hasPlatformCredential: true,
      },
    }).as("keyStatus");

    // Keep the selected day in the future so the test is not dependent on
    // the wall-clock time at which the CI runner executes it.
    cy.mockLabApis([createBookingLab()]);
    cy.mockInstitutionBookingApis();

    cy.intercept("GET", "/api/contract/reservation/getReservationsOfToken*", {
      statusCode: 200,
      body: { count: 0, labId: 1 },
    }).as("getReservationCount");
  });

  it("should render reservation form for authenticated user", () => {
    visitReservation();

    cy.wait("@getSession");
    cy.wait("@resolveInstitution");
    cy.wait("@keyStatus");
    // Ensure mocked lab list is loaded (avoid Wallet-mode race that triggers on-chain calls)
    cy.wait("@getAllLabs");
    cy.wait("@getLab");
    cy.wait("@getMetadata");

    cy.contains("Book a Lab").should("be.visible");
    cy.contains("Select the lab:").should("be.visible");
    cy.get("select").contains("Physics Lab").should("exist");
    cy.get("#duration-select").should("be.visible");
    cy.get("#time-select").should("be.visible");
    cy.contains("button", /book now/i).should("exist");
  });

  it("requires a final review before requesting the institutional passkey", () => {
    visitReservation();
    cy.wait("@getSession");
    cy.wait("@resolveInstitution");
    cy.wait("@keyStatus");
    cy.wait("@getAllLabs");
    cy.wait("@getLab");
    cy.wait("@getMetadata");

    cy.get("#time-select").should("not.be.disabled");
    cy.contains("button", /book now/i).should("not.be.disabled").click();
    cy.get('[role="dialog"]').should("be.visible");
    cy.contains("h2", "Review reservation").should("be.visible");
    cy.contains("button", "Confirm reservation").should("be.visible");
  });
});
