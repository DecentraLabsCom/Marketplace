/**
 * Booking Flow E2E Tests
 *
 * Covers the institutional booking boundary and the browser-to-gateway access
 * handoff. The live, non-intercepted variant lives in live-integration.cy.js.
 */
describe("Lab Booking Flow", () => {
  const onboardingStableUserId = "test-user@institution.edu";
  const onboardingInstitutionId = "institution.edu";
  const onboardingMarkerKey = `institutional_browser_passkey:${onboardingInstitutionId}:${onboardingStableUserId}`;
  const intentRequestId = `0x${"a".repeat(64)}`;
  const authorizationSessionId = "authorization-session-booking-1";
  const reservationKey = `0x${"b".repeat(64)}`;

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

  it("executes prepare → WebAuthn → intent → reservation → access handoff", () => {
    const start = Math.floor(Date.now() / 1000) + 3600;
    const end = start + 3600;

    // Keep the popup contract intact while making the authorization result
    // deterministic. The production flow still has to open the authorization
    // window and poll its same-origin proxy endpoints.
    cy.intercept("POST", "/api/backend/intents/actions/prepare", (req) => {
      expect(req.body).to.deep.include({ action: 8 });
      expect(req.body.payload).to.include.keys("labId", "start", "end", "timeslot");

      req.reply({
        statusCode: 200,
        body: {
          kind: "reservation",
          requestId: intentRequestId,
          backendUrl: "https://institution.example.test",
          authorizationUrl: `https://institution.example.test/intents/authorize/ceremony/${authorizationSessionId}`,
          authorizationSessionId,
          intent: {
            meta: { action: 8, requestId: intentRequestId },
            payload: {
              labId: 1,
              reservationKey,
              start,
              end,
            },
          },
        },
      });
    }).as("prepareIntent");

    cy.intercept(
      "GET",
      `/api/backend/intents/authorize/status/${authorizationSessionId}*`,
      {
        statusCode: 200,
        body: { status: "SUCCESS", requestId: intentRequestId },
      },
    ).as("authorizationStatus");

    cy.intercept("GET", `/api/backend/intents/${intentRequestId}*`, {
      statusCode: 200,
      body: {
        status: "executed",
        requestId: intentRequestId,
        reservationKey,
        reservationStatus: "confirmed",
      },
    }).as("intentStatus");

    cy.intercept("GET", `/api/backend/intents/${intentRequestId}/onchain*`, {
      statusCode: 200,
      body: { state: 2, stateName: "executed", requestId: intentRequestId },
    }).as("onchainIntentStatus");

    visitReservationWithAuthorizationPopupStub();
    cy.wait("@getSession");
    cy.wait("@resolveInstitution");
    cy.wait("@keyStatus");
    cy.wait("@getAllLabs");
    cy.wait("@getLab");
    cy.wait("@getMetadata");

    cy.get("#time-select").should("not.be.disabled");
    cy.contains("button", /book now/i).click();
    cy.contains("button", "Confirm reservation").click();

    cy.wait("@prepareIntent").its("request.body.payload").should("include", {
      labId: 1,
    });
    cy.wait("@authorizationStatus");
    cy.wait("@intentStatus");
    cy.wait("@onchainIntentStatus");

    // The confirmed reservation is now handed to the real Marketplace access
    // boundary. The UI component is covered separately; this assertion keeps
    // the booking-to-access contract in one browser-level scenario.
    cy.intercept("POST", "/api/auth/lab-access", (req) => {
      expect(req.body).to.deep.include({ labId: 1, reservationKey });
      expect(req.body).not.to.have.any.keys("samlAssertion", "institutionalBackendSessionToken", "jwt");
      req.reply({
        statusCode: 200,
        body: {
          accessCode: "opaque-gateway-code",
          labURL: "https://gateway.example.test/guacamole/",
          gatewayOrigin: "https://gateway.example.test",
          resourceType: "lab",
          reservationKey,
        },
      });
    }).as("requestLabAccess");
    cy.intercept("POST", "/api/auth/lab-access/handoff", (req) => {
      expect(req.headers["content-type"]).to.match(/application\/x-www-form-urlencoded/);
      expect(req.body).to.include("lab_id=1");
      expect(req.body).to.include("access_code=opaque-gateway-code");
      expect(req.body).not.to.match(/saml|jwt|bearer|assertion/i);
      req.reply({ statusCode: 204, body: "" });
    }).as("accessHandoff");

    cy.window().then(async (win) => {
      const accessResponse = await win.fetch("/api/auth/lab-access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ labId: 1, reservationKey }),
      });
      expect(accessResponse.ok).to.equal(true);

      const accessBody = await accessResponse.json();
      expect(accessBody.accessCode).to.equal("opaque-gateway-code");

      const handoffResponse = await win.fetch("/api/auth/lab-access/handoff", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          lab_id: "1",
          access_code: accessBody.accessCode,
        }),
      });
      expect(handoffResponse.status).to.equal(204);
    });
    cy.wait("@requestLabAccess");
    cy.wait("@accessHandoff");
  });

  function visitReservationWithAuthorizationPopupStub() {
    cy.visit("/reservation/1", {
      onBeforeLoad(win) {
        win.localStorage.setItem(
          onboardingMarkerKey,
          JSON.stringify({ verifiedAt: Date.now(), advisoryDismissedAt: null }),
        );

        let popupClosed = false;
        const popup = {
          document: {
            open() {},
            write() {},
            close() {},
          },
          focus() {},
          location: { href: "" },
          close() {
            popupClosed = true;
          },
        };
        Object.defineProperty(popup, "closed", {
          get: () => popupClosed,
        });
        win.open = () => popup;
      },
    });
  }
});
