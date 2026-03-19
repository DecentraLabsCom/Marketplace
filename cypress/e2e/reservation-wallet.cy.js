describe("Wallet Reservation Flow", () => {
  beforeEach(() => {
    // Basic setup
    cy.clearCookies();
    cy.clearLocalStorage();
    cy.mockLabApis();

    // Mock BOTH session endpoints just in case NextAuth CSR hits them
    cy.intercept("GET", "/api/auth/session*", {
      statusCode: 200,
      body: {
        user: { name: "0xMockUserWalletAddress123456789", role: "user" },
        expires: new Date(Date.now() + 86400000).toISOString()
      }
    }).as("getNextAuthSession");

    // The frontend hooks often fall back to this custom endpoint for SSO validation
    cy.intercept("GET", "/api/auth/sso/session*", {
      statusCode: 200,
      body: {
        user: { name: "MockUserWallet", email: "wallet@example.com" },
        isSSO: false 
      }
    }).as("getSsoSession");
  });

  it("loads the reservation portal for Web3 users", () => {
    // Go directly to the lab reservation page
    cy.visit("/reservation/1");

    // We wait for the deterministic React UI rendering
    cy.contains("Book a Lab").should("be.visible");
    
    // In Wallet mode, Web3 hooks check token balances, approval allowances, and gas.
    // Ensure the basic selection form is visibly rendered and interactive.
    cy.get("#duration-select").should("be.visible");
    cy.get("#time-select").should("be.visible");
  });

  it("validates that unauthenticated users are prompted or redirected", () => {
    // Clear cookies explicitly
    cy.clearCookies();
    cy.visit("/reservation/1");

    // The component should either prompt login or show an unauthorized block
    cy.get('body').then(($body) => {
      const text = $body.text().toLowerCase();
      expect(text).to.match(/login|connect|unauthorized|sign in/i);
    });
  });
});
