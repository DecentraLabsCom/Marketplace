/**
 * FMU Catalog Filter E2E Tests
 *
 * Verifies the resource type filter (All / Labs / FMU) in the marketplace catalog.
 * Uses a mixed set of labs and FMU resources to test filtering behavior.
 */

describe("Market - FMU resource type filter", () => {
  const labs = [
    {
      id: 1,
      owner: "0xprovider1230000000000000000000000000000000000",
      providerName: "Physics University",
      providerEmail: "physics@test.edu",
      providerCountry: "ES",
      uri: "lab-physics.json",
      price: "1000000000000000000",
      isListed: true,
      metadata: {
        name: "Physics Lab",
        description: "Remote physics experiments",
        keywords: ["physics"],
        attributes: [],
      },
    },
    {
      id: 2,
      owner: "0xprovider4560000000000000000000000000000000000",
      providerName: "Engineering University",
      providerEmail: "eng@test.edu",
      providerCountry: "DE",
      uri: "fmu-spring.json",
      price: "500000000000000000",
      isListed: true,
      metadata: {
        name: "Spring-Damper Simulation",
        description: "FMU model of a spring-damper system",
        keywords: ["fmu", "simulation"],
        attributes: [
          { trait_type: "resourceType", value: "fmu" },
          { trait_type: "maxConcurrentUsers", value: 50 },
          { trait_type: "fmiVersion", value: "2.0" },
          { trait_type: "fmuFileName", value: "spring-damper.fmu" },
          { trait_type: "simulationType", value: "CoSimulation" },
        ],
      },
    },
    {
      id: 3,
      owner: "0xprovider7890000000000000000000000000000000000",
      providerName: "Robotics Institute",
      providerEmail: "robotics@test.edu",
      providerCountry: "US",
      uri: "fmu-motor.json",
      price: "750000000000000000",
      isListed: true,
      metadata: {
        name: "DC Motor Simulation",
        description: "FMU model of a DC motor",
        keywords: ["fmu", "motor"],
        attributes: [
          { trait_type: "resourceType", value: "fmu" },
          { trait_type: "maxConcurrentUsers", value: 20 },
          { trait_type: "fmiVersion", value: "3.0" },
          { trait_type: "fmuFileName", value: "dc-motor.fmu" },
          { trait_type: "simulationType", value: "CoSimulation" },
        ],
      },
    },
    {
      id: 4,
      owner: "0xprovider1230000000000000000000000000000000000",
      providerName: "Physics University",
      providerEmail: "physics@test.edu",
      providerCountry: "ES",
      uri: "lab-chemistry.json",
      price: "2000000000000000000",
      isListed: true,
      metadata: {
        name: "Chemistry Lab",
        description: "Remote chemistry experiments",
        keywords: ["chemistry"],
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

  it("shows all resources by default (All Types)", () => {
    // All 4 listed resources should be visible
    cy.get(".grid").find("h2").should("have.length", 4);
    cy.contains("h2", "Physics Lab").should("be.visible");
    cy.contains("h2", "Spring-Damper Simulation").should("be.visible");
    cy.contains("h2", "DC Motor Simulation").should("be.visible");
    cy.contains("h2", "Chemistry Lab").should("be.visible");
  });

  it("filters to show only labs when toggled to Labs only", () => {
    // Click the resource type toggle — first click goes from All → lab
    cy.contains("button", /all types/i).click();
    cy.contains("button", /labs only/i).should("be.visible");

    // Only labs (no resourceType or resourceType = 'lab') should be visible
    cy.get(".grid").find("h2").should("have.length", 2);
    cy.contains("h2", "Physics Lab").should("be.visible");
    cy.contains("h2", "Chemistry Lab").should("be.visible");
    cy.contains("h2", "Spring-Damper Simulation").should("not.exist");
    cy.contains("h2", "DC Motor Simulation").should("not.exist");
  });

  it("filters to show only FMU when toggled to FMU only", () => {
    // Click twice: All → lab → fmu
    cy.contains("button", /all types/i).click();
    cy.contains("button", /labs only/i).click();
    cy.contains("button", /fmu only/i).should("be.visible");

    // Only FMU resources should be visible
    cy.get(".grid").find("h2").should("have.length", 2);
    cy.contains("h2", "Spring-Damper Simulation").should("be.visible");
    cy.contains("h2", "DC Motor Simulation").should("be.visible");
    cy.contains("h2", "Physics Lab").should("not.exist");
    cy.contains("h2", "Chemistry Lab").should("not.exist");
  });

  it("cycles back to All Types after FMU only", () => {
    // Click three times: All → lab → fmu → All
    cy.contains("button", /all types/i).click();
    cy.contains("button", /labs only/i).click();
    cy.contains("button", /fmu only/i).click();
    cy.contains("button", /all types/i).should("be.visible");

    // All resources should be visible again
    cy.get(".grid").find("h2").should("have.length", 4);
  });

  it("shows FMU badge on FMU cards", () => {
    // FMU cards should display the ⚙ FMU badge
    cy.contains("⚙ FMU").should("exist");
  });

  it("shows Explore Simulation on FMU cards and Explore Lab on lab cards", () => {
    cy.contains("Explore Simulation").should("exist");
    cy.contains("Explore Lab").should("exist");
  });

  it("combines resource type filter with text search", () => {
    // Filter to FMU only first
    cy.contains("button", /all types/i).click();
    cy.contains("button", /labs only/i).click();
    cy.contains("button", /fmu only/i).should("be.visible");

    // Search within FMUs
    cy.get("#search-bar").type("Motor");
    cy.wait(400);

    cy.get(".grid").find("h2").should("have.length", 1);
    cy.contains("h2", "DC Motor Simulation").should("be.visible");
  });
});
