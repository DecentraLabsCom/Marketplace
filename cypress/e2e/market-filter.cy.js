/**
 * Market filtering E2E tests
 * - Verifies real-time search (debounced)
 * - Verifies Search button triggers the same filter
 * - Verifies Listed / All labs toggle shows/hides unlisted labs
 */

describe("Market - search and listing toggle", () => {
  const labs = [
    {
      id: 1,
      owner: "0xprovider1230000000000000000000000000000000000",
      providerName: "Test University A",
      providerEmail: "providerA@test.edu",
      providerCountry: "US",
      uri: "lab-a.json",
      price: "1000000000000000000",
      isListed: true,
      metadata: {
        name: "Advanced AI Lab",
        description: "Machine learning research",
        keywords: ["ai", "machine learning"],
        attributes: [],
      },
    },
    {
      id: 2,
      owner: "0xprovider4560000000000000000000000000000000000",
      providerName: "Test University B",
      providerEmail: "providerB@test.edu",
      providerCountry: "DE",
      uri: "lab-b.json",
      price: "2000000000000000000",
      isListed: false, // unlisted lab
      metadata: {
        name: "Quantum Computing Lab",
        description: "Quantum research facility",
        keywords: ["quantum", "computing"],
        attributes: [],
      },
    },
    {
      id: 3,
      owner: "0xprovider7890000000000000000000000000000000000",
      providerName: "Test University C",
      providerEmail: "providerC@test.edu",
      providerCountry: "ES",
      uri: "lab-c.json",
      price: "500000000000000000",
      isListed: true,
      metadata: {
        name: "Basic AI Lab",
        description: "Entry level AI",
        keywords: ["ai", "basics"],
        attributes: [],
      },
    },
  ];

  beforeEach(() => {
    cy.clearCookies();
    cy.clearLocalStorage();
    cy.mockLabApis(labs);
    cy.visit("/");
    cy.wait("@getAllLabs");
  });

  it("filters labs in real time as the user types (debounced)", () => {
    // Type 'AI' and wait for debounce (300ms in app)
    cy.get("#search-bar").type("AI");
    cy.wait(400);

    // Only the two AI labs should be visible
    cy.get(".grid").find("h2").should("have.length", 2);
    cy.contains("h2", "Advanced AI Lab").should("be.visible");
    cy.contains("h2", "Basic AI Lab").should("be.visible");

    // Clear search -> all listed labs should reappear (unlisted still hidden)
    cy.get("#search-bar").clear();
    cy.wait(400);
    cy.get(".grid").find("h2").should("have.length", 2);
  });

  it("triggers search when Search button is clicked", () => {
    cy.get("#search-bar").clear().type("Quantum");
    cy.contains("button", /search/i).click();
    cy.wait(400);

    cy.get(".grid").find("h2").should("have.length", 1);
    cy.contains("Quantum Computing Lab").should("be.visible");
  });

  it("Listed / All labs toggle hides and shows unlisted labs", () => {
    // By default unlisted lab should be hidden
    cy.contains("h2", "Quantum Computing Lab").should("not.exist");

    // Toggle to show unlisted labs
    cy.contains("button", /listed labs/i).click();
    cy.contains("button", /all labs/i).should("be.visible");

    // Unlisted lab should now be visible
    cy.contains("h2", "Quantum Computing Lab").should("be.visible");

    // Toggle back to listed-only
    cy.contains("button", /all labs/i).click();
    cy.contains("h2", "Quantum Computing Lab").should("not.exist");
  });
});
