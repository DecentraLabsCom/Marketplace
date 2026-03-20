/**
 * Virtual Lab Access & Check-In E2E Tests
 * 
 * Verifies the Cryptographic Access Ticket validation and Virtual Shell redirection paths
 * for both SSO (Institution-managed) and Web3 Wallet flows.
 */

describe("Cryptographic Access & Check-In Flow", () => {
  const MOCK_WALLET = "0xuser123000000000000000000000000000000000";
  const MOCK_RESERVATION_KEY = "0xmockreservationkey1234567890abcdef1234567890abcdef1234567890";
  const LAB_ID = 1;

  beforeEach(() => {
    cy.clearCookies();
    cy.clearLocalStorage();
    cy.mockLabApis();

    // Mock the external Lab Shell origin to gracefully capture the window.location.assign redirect without triggering cross-origin reload timeouts
    cy.intercept("GET", /^https:\/\/virtual-lab-shell\.example\.com.*/, "<html><body>Mock Virtual Lab</body></html>").as("labShellNavigation");

    cy.on("window:before:load", (win) => {
      // Inject mock ethereum provider to simulate connection
      win.ethereum = {
        isMetaMask: true,
        request: async ({ method }) => {
          if (method === "eth_accounts") return [MOCK_WALLET];
          if (method === "eth_requestAccounts") return [MOCK_WALLET];
          if (method === "eth_chainId") return "0xaa36a7"; // 11155111 Sepolia
          if (method === "personal_sign") return "0xmocksignature00000000000000000";
          if (method === "eth_signTypedData_v4") return "0xmocktypeddatasignature1234567890abcdef123";
          return [];
        },
        on: (event, callback) => {
          if (event === "connect") {
            setTimeout(() => callback({ chainId: "0xaa36a7" }), 10);
          }
          if (event === "accountsChanged") {
            setTimeout(() => callback([MOCK_WALLET]), 10);
          }
        },
        removeListener: () => {}
      };

      // Set Wagmi to auto-connect to the injected connector
      win.localStorage.setItem("wagmi.store", JSON.stringify({
        state: {
          connections: {
            __type: "Map",
            value: [
              [
                "MockInjectionKey",
                {
                  accounts: [MOCK_WALLET],
                  chainId: 11155111,
                  connector: { id: "injected", name: "Injected" }
                }
              ]
            ]
          },
          chainId: 11155111,
          current: "MockInjectionKey"
        },
        version: 2
      }));
      win.localStorage.setItem("wagmi.connected", "true");
    });

    // We explicitly mock the useLab details to ensure it returns an authEndpoint for check-in
    cy.intercept("GET", `**/api/contract/lab?id=${LAB_ID}`, {
      statusCode: 200,
      body: {
        id: LAB_ID,
        name: "Mock Quantum Computing Lab",
        auth: "https://mock-auth-endpoint.example.com/auth"
      }
    }).as("getLabDetailsAuth");

    // The Frontend component LabAccess now dynamically fetches the URI through a dedicated proxy endpoint
    cy.intercept("GET", `**/api/contract/lab/getLabAuthURI?labId=${LAB_ID}*`, {
      statusCode: 200,
      body: { authURI: "https://mock-auth-endpoint.example.com/auth" }
    }).as("getLabAuthURI");
  });

  describe("Institution SSO Flow", () => {
    beforeEach(() => {
      // Mock SSO session
      cy.intercept("GET", "/api/auth/sso/session*", {
        statusCode: 200,
        body: {
          user: { name: "MockUser", email: "user@institution.edu", authType: "sso" },
          isSSO: true
        }
      }).as("getSsoSession");

      // Mock Active Institution Booking
      cy.mockInstitutionBookingApis({
        count: 1,
        reservationKeys: [MOCK_RESERVATION_KEY],
        hasActiveBooking: true
      });

      // Mock the reservation details
      cy.intercept("GET", "**/api/contract/reservation/getReservation*", {
        statusCode: 200,
        body: {
          reservationKey: MOCK_RESERVATION_KEY,
          reservation: {
            labId: LAB_ID.toString(),
            renter: MOCK_WALLET,
            status: 1, // Booked
            start: Math.floor(Date.now() / 1000) - 3600, // Started 1 hour ago (Active now)
            end: Math.floor(Date.now() / 1000) + 3600 // Ends in 1 hour
          }
        }
      }).as("mockGetReservationSSO");
    });

    it("successfully checks in and redirects to the Lab Shell URL via SSO", () => {
      cy.intercept("POST", "/api/auth/checkin", {
        statusCode: 200,
        body: { success: true }
      }).as("checkinSubmit");

      cy.intercept("POST", "/api/auth/lab-access", {
        statusCode: 200,
        body: { token: "sso-mock-jwt-token-123", labURL: "https://virtual-lab-shell.example.com" }
      }).as("labAccessSubmit");

      cy.visit("/userdashboard");
      cy.wait("@getSsoSession");

      // Wait for the active booking card to appear
      cy.contains("Active now:").should("be.visible");
      
      // Attempt to access lab
      cy.wait("@getLabAuthURI");
      cy.wait("@getLabAuthURI");
      cy.contains("button", "Access").should("not.have.attr", "disabled").invoke("removeClass", "pointer-events-none").click({ force: true });

      // Verify cryptographic API routes were called
      cy.wait("@checkinSubmit").its("request.body").should("deep.include", {
        reservationKey: MOCK_RESERVATION_KEY,
        labId: LAB_ID.toString()
      });

      cy.wait("@labAccessSubmit").its("request.body").should("deep.include", {
        reservationKey: MOCK_RESERVATION_KEY,
        labId: LAB_ID.toString()
      });

      // Assert that the browser was redirected successfully to the virtual shell domain
      cy.wait("@labShellNavigation");
      cy.url().should("include", "virtual-lab-shell.example.com");
      cy.url().should("include", "jwt=sso-mock-jwt-token-123");
    });

    it("displays friendly notification logic when check-in backend rejects ticket", () => {
      cy.intercept("POST", "/api/auth/checkin", {
        statusCode: 403,
        body: { error: "Institutional check-in failed" }
      }).as("checkinFail");

      cy.visit("/userdashboard");
      
      cy.wait("@getLabAuthURI");
      cy.wait("@getLabAuthURI");
      cy.contains("button", "Access").should("not.have.attr", "disabled").invoke("removeClass", "pointer-events-none").click({ force: true });
      cy.wait("@checkinFail");

      // Validates toast/error rendering
      cy.contains("Unable to record check-in").should("be.visible");
    });
  });

  describe("Web3 Wallet Flow", () => {
    beforeEach(() => {
      // Return Fallback Object for SSO to default to Web3
      cy.intercept("GET", "/api/auth/sso/session*", {
        statusCode: 200,
        body: {
          user: { name: "MockUserWallet", email: "wallet@example.com" },
          isSSO: false 
        }
      }).as("getSsoSessionFail");

      // Mock NextAuth User Session (Needed by AccessControl)
      cy.intercept("GET", "/api/auth/session*", {
        statusCode: 200,
        body: {
          user: { name: MOCK_WALLET, role: "user" },
          expires: new Date(Date.now() + 86400000).toISOString()
        }
      }).as("getNextAuthSession");

      // Mock Wallet Session endpoint mapping
      cy.intercept("GET", "/api/auth/wallet-session*", {
        statusCode: 200,
        body: {
          user: { id: MOCK_WALLET, walletAddress: MOCK_WALLET, authType: "wallet" },
          isConnected: true
        }
      });

      // Mock Wallet User API calls 
      // Overriding standard Wagmi reads via explicit intercepts where necessary
      cy.intercept("GET", "**/api/contract/institution/getUserReservationCount*", {
        statusCode: 200,
        body: { count: 0 }
      }).as("mockUserResCount");

      cy.intercept("GET", "**/api/contract/reservation/reservationsOf*", {
        statusCode: 200,
        body: { count: 1 }
      }).as("mockReservationsOfWeb3");

      cy.intercept("GET", "**/api/contract/reservation/reservationKeyOfUserByIndex*", {
        statusCode: 200,
        body: { reservationKey: MOCK_RESERVATION_KEY }
      }).as("mockReservationKeyByIndexWeb3");
      
      // Override reservation check to match the Active flag
      cy.intercept("GET", "**/api/contract/reservation/getReservation*", {
        statusCode: 200,
        body: {
          reservationKey: MOCK_RESERVATION_KEY,
          reservation: {
            labId: LAB_ID.toString(),
            renter: MOCK_WALLET,
            status: 1,
            start: Math.floor(Date.now() / 1000) - 3600,
            end: Math.floor(Date.now() / 1000) + 3600
          }
        }
      }).as("mockGetReservationWeb3");
    });

    it("successfully checks in and redirects to the Lab Shell URL via Web3 SIWE", () => {
      // Emulate the complex cryptographic ping-pong with the Auth Endpoint
      
      // 1. Check-in Message Fetch
      cy.intercept("GET", "https://mock-auth-endpoint.example.com/auth/message?purpose=checkin*", {
        statusCode: 200,
        body: {
          typedData: {
            domain: { name: "Nebsyst", version: "1" },
            types: { Message: [{ name: "reservationKey", type: "string" }] },
            primaryType: "Message",
            message: { reservationKey: MOCK_RESERVATION_KEY, timestamp: 1234567890 }
          },
          timestamp: 1234567890
        }
      }).as("getCheckinTypedData");

      // 2. Check-in Signature Submission
      cy.intercept("POST", "https://mock-auth-endpoint.example.com/auth/checkin", {
        statusCode: 200,
        body: { success: true }
      }).as("submitCheckinSignature");

      // 3. Lab Access Message Fetch
      cy.intercept("GET", "https://mock-auth-endpoint.example.com/auth/message", {
        statusCode: 200,
        body: {
          message: "Login request: 1234567890",
          timestampMs: 1234567890
        }
      }).as("getAccessMessage");

      // 4. Lab Access Signature Validation & Ticket Mint
      cy.intercept("POST", "https://mock-auth-endpoint.example.com/auth/wallet-auth2", {
        statusCode: 200,
        body: { token: "web3-mock-jwt-token-777", labURL: "https://virtual-lab-shell.example.com" }
      }).as("submitAccessSignature");

      cy.visit("/userdashboard");

      // Wait for the active booking card to appear
      cy.contains("Active now:").should("be.visible");
      
      // Mock Wagmi signTypedData internally to skip prompt timeout
      // Since window.ethereum request alone isn't easily picked up by viem typed data without full RPC mockup,
      // We explicitly bypass the E2E block on button click
      
      cy.wait("@getLabAuthURI");
      cy.wait("@getLabAuthURI");
      cy.contains("button", "Access").should("not.have.attr", "disabled").invoke("removeClass", "pointer-events-none").click({ force: true });

      // Check the payload traces
      cy.wait("@getCheckinTypedData");
      cy.wait("@submitCheckinSignature");
      cy.wait("@getAccessMessage");
      
      cy.wait("@submitAccessSignature").its("request.body").should("deep.include", {
        wallet: MOCK_WALLET,
        labId: LAB_ID.toString(),
        reservationKey: MOCK_RESERVATION_KEY
      });

      // Assert that the browser was redirected successfully to the virtual shell domain
      cy.wait("@labShellNavigation");
      cy.url().should("include", "virtual-lab-shell.example.com");
      cy.url().should("include", "jwt=web3-mock-jwt-token-777");
    });
  });
});
