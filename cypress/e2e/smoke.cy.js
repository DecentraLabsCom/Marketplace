/**
 * Smoke Tests - Basic E2E tests with Cypress
 *
 * These tests verify core application functionality
 * without requiring wallet authentication.
 */
describe("Smoke Test - Basic Navigation", () => {
  beforeEach(() => {
    // Visit the home page
    cy.visit("/");
  });

  it("should load the main page correctly", () => {
    // Verify main title is visible
    cy.contains("Explore Online Labs").should("be.visible");

    // Verify login button exists
    cy.contains("button", /login/i).should("be.visible");

    // Verify filter section is present
    cy.get("#category-filter").should("be.visible");
    cy.get("#provider-filter").should("be.visible");
  });

  it("should display available labs", () => {
    // Wait for labs to load (increased timeout to allow API response time)
    cy.contains("button", /listed labs/i, { timeout: 10000 }).should("be.visible");
  });

  // Separated into individual tests to avoid navigation interference
  it("should navigate to About page", () => {
    cy.contains("a", /about/i).click();
    cy.location("pathname", { timeout: 15000 }).should("include", "/about");
    cy.contains("About", { timeout: 10000 }).should("be.visible");
  });

  it("should navigate to FAQ page", () => {
    cy.contains("a", /faq/i).click();
    cy.location("pathname", { timeout: 15000 }).should("include", "/faq");
    cy.contains("FAQ", { timeout: 10000 }).should("be.visible");
  });

  it("should navigate to Contact page", () => {
    cy.contains("a", /contact/i).click();
    cy.location("pathname", { timeout: 15000 }).should("include", "/contact");
    cy.contains("Contact", { timeout: 10000 }).should("be.visible");
  });
});
