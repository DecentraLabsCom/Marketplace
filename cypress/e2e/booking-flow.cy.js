/**
 * Booking Flow E2E Tests
 *
 * Lightweight coverage to ensure reservation UI loads for authenticated users.
 */
describe("Lab Booking Flow", () => {
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

    cy.mockLabApis();

    cy.intercept("GET", "/api/contract/reservation/getReservationsOfToken*", {
      statusCode: 200,
      body: { count: 0, labId: 1 },
    }).as("getReservationCount");
  });

  it("should render reservation form for authenticated user", () => {
    cy.visit("/reservation/1");

    cy.wait("@getSession");
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
});
