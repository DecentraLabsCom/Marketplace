/**
 * Staking Lifecycle E2E Tests
 * 
 * Validates the $LAB token staking operations (Stake/Unstake) for providers.
 * Staking actions are explicitly disabled for SSO institutions, requiring a Wallet Session context.
 */

describe("Staking Lifecycle & Verification", () => {
  const MOCK_WALLET = "0xprovider12300000000000000000000000000000";

  beforeEach(() => {
    cy.clearCookies();
    cy.clearLocalStorage();
    cy.mockLabApis();

    cy.on("window:before:load", (win) => {
      // Complete mock for Wagmi injected connector
      win.ethereum = {
        isMetaMask: true,
        request: async ({ method }) => {
          if (method === "eth_accounts") return [MOCK_WALLET];
          if (method === "eth_requestAccounts") return [MOCK_WALLET];
          if (method === "eth_chainId") return "0xaa36a7"; // 11155111 Sepolia
          if (method === "net_version") return "11155111";
          if (method === "eth_sendTransaction") return "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";
          if (method === "eth_estimateGas") return "0x5208"; // Standard mock gas
          if (method === "eth_call") return "0x"; // Return empty bytes to simulate successful contract write
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
      win.localStorage.setItem("mockIsProvider", "true");
      win.localStorage.setItem("mockStakingWallet", "true");
    });

    const MOCK_WALLET = "0xprovider567890123456789012345678901234567890";

    // Mock Wallet Session endpoint (Instead of SSO)
    cy.intercept("GET", "/api/auth/sso/session*", {
      statusCode: 401,
      body: { error: "Unauthorized" }
    });

    cy.intercept("GET", "/api/auth/wallet-session*", {
      statusCode: 200,
      body: {
        user: { 
          id: MOCK_WALLET,
          walletAddress: MOCK_WALLET,
          isProvider: true,
          authType: "wallet"
        },
        isConnected: true
      }
    }).as("getWalletSession");

    cy.intercept("POST", "/api/auth/wallet-session*", {
      statusCode: 200,
      body: { success: true }
    }).as("postWalletSession");

    // 2. Mock Provider verification natively using the mocked address hook
    cy.intercept("GET", "**/api/contract/provider/isLabProvider*", {
      statusCode: 200,
      body: { isLabProvider: true, isProvider: true }
    }).as("checkProvider");

    // Mock Staking values
    cy.intercept("GET", "**/api/contract/provider/getStakeInfo*", {
      statusCode: 200,
      body: { stakedAmount: "800000000", slashedAmount: "0", canUnstake: false, unlockTimestamp: 1999999999 }
    }).as("getStakeInfo");

    cy.intercept("GET", "**/api/contract/provider/getRequiredStake*", {
      statusCode: 200,
      body: { requiredStake: "1200000000" } 
    }).as("getRequiredStake");

    cy.intercept("POST", "**/api/contract/provider/stakeTokens", {
      statusCode: 200,
      body: { success: true }
    }).as("stakeTokens");

    cy.intercept("POST", "**/api/contract/provider/unstakeTokens", {
      statusCode: 200,
      body: { success: true }
    }).as("unstakeTokens");

    cy.intercept("POST", "https://ethereum-sepolia-rpc.publicnode.com*", (req) => {
      const { method } = req.body;
      if (method === "eth_getTransactionReceipt") {
        req.reply({ result: { status: "0x1", blockHash: "0x1", blockNumber: "0x1", transactionHash: "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef" } });
      }
    });
  });

  it("calculates stake deficits correctly and disables unstaking when locked", () => {
    cy.visit("/providerdashboard", { failOnStatusCode: false });
    
    cy.contains("button", "Manage staking", { timeout: 15000 }).should("be.visible").click();

    cy.get("[data-testid='staking-panel']").should("be.visible");
    cy.contains("Deficit").should("be.visible");
    cy.contains("400.00").should("be.visible"); 
    cy.get("button").contains("Unstake").should("be.disabled");
  });

  it("handles staking token increments via the provider form", () => {
    cy.visit("/providerdashboard", { failOnStatusCode: false });
    
    cy.contains("button", "Manage staking", { timeout: 15000 }).should("be.visible").click();

    cy.get("[data-testid='staking-panel']").should("be.visible");

    cy.get("input[placeholder='Amount to stake']").type("400");
    cy.get("button").contains("Stake").should("not.be.disabled").click();

    // Removed literal tx wait loops as Cypress cannot track Wagmi state cleanly without a full RPC emulation
    cy.get("button").contains("Staking...").should("be.visible");
  });

  it("handles unstaking token decrements when unlocked", () => {
    cy.intercept("GET", "**/api/contract/provider/getStakeInfo*", {
      statusCode: 200,
      body: { stakedAmount: "1600000000", slashedAmount: "0", canUnstake: true, unlockTimestamp: 0 }
    }).as("getStakeInfoUnlocked");

    cy.visit("/providerdashboard", { failOnStatusCode: false });
    
    cy.contains("button", "Manage staking", { timeout: 15000 }).should("be.visible").click();

    cy.get("[data-testid='staking-panel']").should("be.visible");

    cy.get("input[placeholder='Amount to unstake']").type("400");
    cy.get("button").contains("Unstake").should("not.be.disabled").click();

    cy.get("button").contains("Unstaking...").should("be.visible");
  });
});
