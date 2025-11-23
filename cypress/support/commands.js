/**
 * Cypress Custom Commands
 *
 * This file defines reusable Cypress custom commands that can be
 * utilized across multiple test files.
 *
 * Usage example:
 *   cy.customCommand()
 *
 * For more information on custom commands:
 * https://docs.cypress.io/api/cypress-api/custom-commands
 */

/**
 * Intercept LAB token balance API call with mocked data
 *
 * @param {string} balance - Mocked balance value (default: "10.0")
 * @example
 *   cy.mockLabTokenBalance("100.0");
 */
Cypress.Commands.add("mockLabTokenBalance", (balance = "10.0") => {
  cy.intercept("GET", "/api/contract/labtoken/balance*", {
    body: { balance },
  }).as("getBalance");
});

/**
 * Navigate to lab detail page with mocked API response
 *
 * @param {string} id - Lab ID (default: "1")
 * @example
 *   cy.visitLabDetail("2");
 */
Cypress.Commands.add("visitLabDetail", (id = "1") => {
  cy.intercept("GET", `/api/labs/${id}`, {
    fixture: "lab-detail.json",
  }).as("getLab");

  cy.visit(`/lab/${id}`);
  cy.wait("@getLab");
});
