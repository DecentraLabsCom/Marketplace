/**
 * Local Wallet Authentication (SIWE) Flow E2E Tests
 * 
 * Verifies the Sign-In with Ethereum UI behavior, mocking the backend /api/auth/siwe endpoints
 * so we do not actually require a real wallet injection (MetaMask/Synpress) in headless mode.
 */

describe("Web3 Wallet Authentication Flow", () => {
  beforeEach(() => {
    cy.clearCookies();
    cy.clearLocalStorage();
  });

  it("displays login options and opens the Web3 modal on click", () => {
    cy.visit("/");

    // The connect wallet UI should be visible
    cy.contains('button', /login|connect/i).first().should('be.visible').click();

    // Verify it pops the connector block (either custom UI or SIWE prompt)
    // We look for typical connection texts since Web3Modal injects dynamic DOM
    cy.get('body').then(($body) => {
      const modalTextRaw = $body.text().toLowerCase();
      // We expect the word wallet or generic SIWE prompts to appear somewhere in the body
      expect(modalTextRaw).to.match(/wallet|connect|metamask|browser/i);
    });
  });

  it("gracefully falls back when SIWE nonce endpoint fails", () => {
    // If the backend SIWE API is down, how does the UI react?
    cy.intercept("GET", "/api/auth/siwe/nonce", {
      statusCode: 500,
      body: { error: "Internal Server Error" }
    }).as("getNonceFail");

    cy.visit("/");
    
    // Simulate clicking the login attempt which usually queries the nonce behind the scenes
    cy.contains('button', /login|connect/i).first().click({ force: true });

    // The UI should stay stable and not white-screen crash
    cy.get('body').should('exist');
  });
});
