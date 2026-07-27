/**
 * Market filtering E2E tests
 * - Verifies real-time search (debounced)
 * - Verifies Search button triggers the same filter
 * - Verifies Listed / All / Unlisted listing filters show the right labs
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
    cy.get('button[aria-controls="market-filter-panel"]').click();
    cy.get("#market-filter-panel").should("be.visible");
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
    // Use a listed lab so this assertion is independent of the listed/all toggle.
    cy.get("#search-bar").clear().type("Advanced");
    cy.contains("button", /search/i).click();
    cy.wait(400);

    cy.get(".grid").find("h2").should("have.length", 1);
    cy.contains("Advanced AI Lab").should("be.visible");
  });

  it("Listed / All / Unlisted filters show the corresponding labs", () => {
    // By default unlisted lab should be hidden
    cy.get("#listing-filter").should("have.value", "listed");
    cy.contains("h2", "Quantum Computing Lab").should("not.exist");

    // The unlisted option should show only unlisted labs.
    cy.get("#listing-filter").select("unlisted");
    cy.get("#listing-filter").should("have.value", "unlisted");
    cy.contains("h2", "Quantum Computing Lab").should("be.visible");
    cy.contains("h2", "Advanced AI Lab").should("not.exist");
    cy.contains("h2", "Basic AI Lab").should("not.exist");

    // All should include both listed and unlisted labs.
    cy.get("#listing-filter").select("all");
    cy.get("#listing-filter").should("have.value", "all");
    cy.contains("h2", "Advanced AI Lab").should("be.visible");
    cy.contains("h2", "Quantum Computing Lab").should("be.visible");
    cy.contains("h2", "Basic AI Lab").should("be.visible");

    // Listed should return to the default listed-only catalogue.
    cy.get("#listing-filter").select("listed");
    cy.get("#listing-filter").should("have.value", "listed");
    cy.contains("h2", "Quantum Computing Lab").should("not.exist");
    cy.contains("h2", "Advanced AI Lab").should("be.visible");
    cy.contains("h2", "Basic AI Lab").should("be.visible");
  });
});
