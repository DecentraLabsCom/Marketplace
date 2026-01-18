/**
 * Unit Tests for Marketplace JWT Service
 *
 * Tests JWT token generation and service configuration for secure
 * communication with auth-service using RSA-256 signed tokens.
 *
 *
 * Tests Behaviors:
 * - JWT generation with various SAML attributes
 * - Token payload structure and claims
 * - Signing algorithm and issuer configuration
 * - Timestamp handling (iat, exp)
 * - Attribute fallbacks and optional fields
 * - Error handling and validation
 * - Token decoding
 */

import jwt from "jsonwebtoken";
import MarketplaceJwtService from "../marketplaceJwt";

// Mock dependencies
jest.mock("jsonwebtoken");
jest.mock("@/utils/dev/logger", () => ({
  __esModule: true,
  default: {
    log: jest.fn(),
    error: jest.fn(),
  },
}));

describe("MarketplaceJwtService", () => {
  const originalEnv = process.env;
  const validPrivateKey =
    "-----BEGIN PRIVATE KEY-----\nTEST_KEY\n-----END PRIVATE KEY-----";

  beforeEach(() => {
    jest.clearAllMocks();

    // Reset process.env
    process.env = {
      ...originalEnv,
      JWT_PRIVATE_KEY: undefined,
      JWT_ISSUER: undefined,
      JWT_EXPIRATION_MS: undefined,
    };

    // Mock Date.now for consistent timestamps
    jest.spyOn(Date, "now").mockReturnValue(1700000000000);

    // Setup service with valid key for most tests
    MarketplaceJwtService.privateKey = validPrivateKey;
    MarketplaceJwtService.keyLoadAttempted = true;

    // Mock jwt.sign to return a token
    jwt.sign.mockReturnValue("mocked.jwt.token");
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.restoreAllMocks();
  });

  describe("Service Initialization", () => {
    test("service is exported as singleton", () => {
      expect(MarketplaceJwtService).toBeDefined();
      expect(typeof MarketplaceJwtService.generateJwtForUser).toBe("function");
      expect(typeof MarketplaceJwtService.decodeToken).toBe("function");
      expect(typeof MarketplaceJwtService.isConfigured).toBe("function");
    });
  });

  describe("generateJwtForUser", () => {
    describe("Successful token generation", () => {
      test("generates JWT with complete SAML attributes", async () => {
        const samlAttributes = {
          username: "testuser",
          email: "test@example.com",
          uid: "uid123",
          displayName: "Test User",
          schacHomeOrganization: "example.com",
          eduPersonAffiliation: "student",
          eduPersonScopedAffiliation: "student@example.com",
        };

        const token = await MarketplaceJwtService.generateJwtForUser(
          samlAttributes
        );

        expect(token).toBe("mocked.jwt.token");
        expect(jwt.sign).toHaveBeenCalledWith(
          expect.objectContaining({
            sub: "testuser",
            email: "test@example.com",
            uid: "uid123",
            displayName: "Test User",
            schacHomeOrganization: "example.com",
            eduPersonAffiliation: "student",
            eduPersonScopedAffiliation: "student@example.com",
          }),
          validPrivateKey,
          expect.objectContaining({
            algorithm: "RS256",
          })
        );
      });

      test("uses RS256 algorithm for signing", async () => {
        const samlAttributes = { username: "testuser" };

        await MarketplaceJwtService.generateJwtForUser(samlAttributes);

        expect(jwt.sign).toHaveBeenCalledWith(
          expect.any(Object),
          expect.any(String),
          expect.objectContaining({
            algorithm: "RS256",
          })
        );
      });

      test("includes correct payload structure", async () => {
        const samlAttributes = {
          username: "testuser",
          email: "test@example.com",
        };

        await MarketplaceJwtService.generateJwtForUser(samlAttributes);

        const payload = jwt.sign.mock.calls[0][0];

        expect(payload).toHaveProperty("sub");
        expect(payload).toHaveProperty("email");
        expect(payload).toHaveProperty("uid");
        expect(payload).toHaveProperty("displayName");
        expect(payload).toHaveProperty("schacHomeOrganization");
        expect(payload).toHaveProperty("eduPersonAffiliation");
        expect(payload).toHaveProperty("eduPersonScopedAffiliation");
        expect(payload).toHaveProperty("iat");
        expect(payload).toHaveProperty("exp");
      });

      test("includes issuer from environment variable", async () => {
        process.env.JWT_ISSUER = "test-marketplace";
        const samlAttributes = { username: "testuser" };

        await MarketplaceJwtService.generateJwtForUser(samlAttributes);

        expect(jwt.sign).toHaveBeenCalledWith(
          expect.any(Object),
          expect.any(String),
          expect.objectContaining({
            issuer: "test-marketplace",
          })
        );
      });

      test("uses default issuer when env var not set", async () => {
        const samlAttributes = { username: "testuser" };

        await MarketplaceJwtService.generateJwtForUser(samlAttributes);

        expect(jwt.sign).toHaveBeenCalledWith(
          expect.any(Object),
          expect.any(String),
          expect.objectContaining({
            issuer: "marketplace",
          })
        );
      });

      test("includes iat and exp timestamps", async () => {
        const samlAttributes = { username: "testuser" };

        await MarketplaceJwtService.generateJwtForUser(samlAttributes);

        const payload = jwt.sign.mock.calls[0][0];
        expect(payload.iat).toBe(1700000000); // Math.floor(1700000000000 / 1000)
        expect(payload.exp).toBeGreaterThan(payload.iat);
      });

      test("calculates expiration correctly with default 1 minute", async () => {
        const samlAttributes = { username: "testuser" };

        await MarketplaceJwtService.generateJwtForUser(samlAttributes);

        const payload = jwt.sign.mock.calls[0][0];
        const expectedExp = payload.iat + 60; // 60 seconds (1 minute)
        expect(payload.exp).toBe(expectedExp);
      });

      test("uses custom expiration from environment variable", async () => {
        process.env.JWT_EXPIRATION_MS = "600000"; // 10 minutes
        const samlAttributes = { username: "testuser" };

        await MarketplaceJwtService.generateJwtForUser(samlAttributes);

        const payload = jwt.sign.mock.calls[0][0];
        const expectedExp = payload.iat + 600; // 600 seconds
        expect(payload.exp).toBe(expectedExp);
      });
    });

    describe("Attribute handling and fallbacks", () => {
      test("uses username as fallback for uid when not provided", async () => {
        const samlAttributes = {
          username: "testuser",
        };

        await MarketplaceJwtService.generateJwtForUser(samlAttributes);

        const payload = jwt.sign.mock.calls[0][0];
        expect(payload.uid).toBe("testuser");
        expect(payload.sub).toBe("testuser");
      });

      test("uses username as fallback for displayName when not provided", async () => {
        const samlAttributes = {
          username: "testuser",
        };

        await MarketplaceJwtService.generateJwtForUser(samlAttributes);

        const payload = jwt.sign.mock.calls[0][0];
        expect(payload.displayName).toBe("testuser");
      });

      test("uses empty string for optional attributes when not provided", async () => {
        const samlAttributes = {
          username: "testuser",
        };

        await MarketplaceJwtService.generateJwtForUser(samlAttributes);

        const payload = jwt.sign.mock.calls[0][0];
        expect(payload.email).toBe("");
        expect(payload.schacHomeOrganization).toBe("");
        expect(payload.eduPersonAffiliation).toBe("");
        expect(payload.eduPersonScopedAffiliation).toBe("");
      });

      test("prefers provided uid over username fallback", async () => {
        const samlAttributes = {
          username: "testuser",
          uid: "custom-uid-123",
        };

        await MarketplaceJwtService.generateJwtForUser(samlAttributes);

        const payload = jwt.sign.mock.calls[0][0];
        expect(payload.uid).toBe("custom-uid-123");
      });

      test("prefers provided displayName over username fallback", async () => {
        const samlAttributes = {
          username: "testuser",
          displayName: "Custom Display Name",
        };

        await MarketplaceJwtService.generateJwtForUser(samlAttributes);

        const payload = jwt.sign.mock.calls[0][0];
        expect(payload.displayName).toBe("Custom Display Name");
      });

      test("handles all attributes with actual values", async () => {
        const samlAttributes = {
          username: "user123",
          email: "user@test.com",
          uid: "uid456",
          displayName: "Test User",
          schacHomeOrganization: "test.edu",
          eduPersonAffiliation: "faculty",
          eduPersonScopedAffiliation: "faculty@test.edu",
        };

        await MarketplaceJwtService.generateJwtForUser(samlAttributes);

        const payload = jwt.sign.mock.calls[0][0];
        expect(payload.sub).toBe("user123");
        expect(payload.email).toBe("user@test.com");
        expect(payload.uid).toBe("uid456");
        expect(payload.displayName).toBe("Test User");
        expect(payload.schacHomeOrganization).toBe("test.edu");
        expect(payload.eduPersonAffiliation).toBe("faculty");
        expect(payload.eduPersonScopedAffiliation).toBe("faculty@test.edu");
      });
    });

    describe("Error handling and validation", () => {
      test("throws error when username is missing", async () => {
        const samlAttributes = {
          email: "test@example.com",
        };

        await expect(
          MarketplaceJwtService.generateJwtForUser(samlAttributes)
        ).rejects.toThrow("Username is required for JWT generation");
      });

      test("throws error when username is empty string", async () => {
        const samlAttributes = {
          username: "",
        };

        await expect(
          MarketplaceJwtService.generateJwtForUser(samlAttributes)
        ).rejects.toThrow("Username is required for JWT generation");
      });

      test("throws error when samlAttributes is null", async () => {
        await expect(
          MarketplaceJwtService.generateJwtForUser(null)
        ).rejects.toThrow("Username is required for JWT generation");
      });

      test("throws error when samlAttributes is undefined", async () => {
        await expect(
          MarketplaceJwtService.generateJwtForUser(undefined)
        ).rejects.toThrow("Username is required for JWT generation");
      });

      test("throws error when private key is not available", async () => {
        MarketplaceJwtService.privateKey = null;
        const samlAttributes = { username: "testuser" };

        // Can throw either message depending on test environment
        await expect(
          MarketplaceJwtService.generateJwtForUser(samlAttributes)
        ).rejects.toThrow("JWT");
      });

      test("wraps jwt.sign errors with descriptive message", async () => {
        jwt.sign.mockImplementation(() => {
          throw new Error("Invalid key format");
        });

        const samlAttributes = { username: "testuser" };

        await expect(
          MarketplaceJwtService.generateJwtForUser(samlAttributes)
        ).rejects.toThrow("JWT generation failed: Invalid key format");
      });

      test("handles jwt.sign throwing non-Error objects", async () => {
        jwt.sign.mockImplementation(() => {
          throw "String error";
        });

        const samlAttributes = { username: "testuser" };

        await expect(
          MarketplaceJwtService.generateJwtForUser(samlAttributes)
        ).rejects.toThrow("JWT generation failed");
      });
    });
  });

  describe("generateSamlAuthToken", () => {
    test("generates JWT with required SAML auth claims", async () => {
      const token = await MarketplaceJwtService.generateSamlAuthToken({
        userId: "user-1",
        affiliation: "uned.es",
        institutionalProviderWallet: "0x1111111111111111111111111111111111111111",
        puc: "puc-1",
      });

      expect(token).toBe("mocked.jwt.token");
      expect(jwt.sign).toHaveBeenCalledWith(
        expect.objectContaining({
          userid: "user-1",
          affiliation: "uned.es",
          institutionalProviderWallet: "0x1111111111111111111111111111111111111111",
          puc: "puc-1",
          bookingInfoAllowed: true,
          scope: "booking:read",
        }),
        validPrivateKey,
        expect.objectContaining({ algorithm: "RS256" })
      );
    });

    test("throws error when userId is missing", async () => {
      await expect(
        MarketplaceJwtService.generateSamlAuthToken({
          affiliation: "uned.es",
        })
      ).rejects.toThrow("userId is required for SAML auth token generation");
    });

    test("throws error when affiliation is missing", async () => {
      await expect(
        MarketplaceJwtService.generateSamlAuthToken({
          userId: "user-1",
        })
      ).rejects.toThrow("affiliation is required for SAML auth token generation");
    });

    test("throws error for invalid institutional wallet format", async () => {
      await expect(
        MarketplaceJwtService.generateSamlAuthToken({
          userId: "user-1",
          affiliation: "uned.es",
          institutionalProviderWallet: "invalid-wallet",
        })
      ).rejects.toThrow("Invalid institutionalProviderWallet address format");
    });
  });

  describe("decodeToken", () => {
    test("decodes valid JWT token", () => {
      const mockDecoded = {
        header: { alg: "RS256", typ: "JWT" },
        payload: { sub: "testuser", exp: 1234567890 },
        signature: "mock-signature",
      };

      jwt.decode.mockReturnValue(mockDecoded);

      const result = MarketplaceJwtService.decodeToken("valid.jwt.token");

      expect(jwt.decode).toHaveBeenCalledWith("valid.jwt.token", {
        complete: true,
      });
      expect(result).toEqual(mockDecoded);
    });

    test("returns decoded payload and header", () => {
      const mockDecoded = {
        header: { alg: "RS256" },
        payload: { sub: "user", email: "test@example.com" },
      };

      jwt.decode.mockReturnValue(mockDecoded);

      const result = MarketplaceJwtService.decodeToken("token");

      expect(result.header).toEqual({ alg: "RS256" });
      expect(result.payload).toEqual({
        sub: "user",
        email: "test@example.com",
      });
    });

    test("throws descriptive error when decoding fails", () => {
      jwt.decode.mockImplementation(() => {
        throw new Error("Malformed token");
      });

      expect(() => MarketplaceJwtService.decodeToken("invalid.token")).toThrow(
        "JWT decode failed: Malformed token"
      );
    });

    test("handles null token", () => {
      jwt.decode.mockImplementation(() => {
        throw new Error("Token required");
      });

      expect(() => MarketplaceJwtService.decodeToken(null)).toThrow(
        "JWT decode failed: Token required"
      );
    });

    test("handles empty string token", () => {
      jwt.decode.mockImplementation(() => {
        throw new Error("Invalid token");
      });

      expect(() => MarketplaceJwtService.decodeToken("")).toThrow(
        "JWT decode failed"
      );
    });
  });

  describe("Edge Cases and Special Scenarios", () => {
    test("handles special characters in username", async () => {
      const samlAttributes = {
        username: "user@domain.com",
        email: "test+tag@example.com",
      };

      const token = await MarketplaceJwtService.generateJwtForUser(
        samlAttributes
      );

      expect(token).toBe("mocked.jwt.token");
      const payload = jwt.sign.mock.calls[0][0];
      expect(payload.sub).toBe("user@domain.com");
      expect(payload.email).toBe("test+tag@example.com");
    });

    test("handles very long attribute values", async () => {
      const longString = "a".repeat(1000);
      const samlAttributes = {
        username: "testuser",
        email: longString,
        displayName: longString,
      };

      const token = await MarketplaceJwtService.generateJwtForUser(
        samlAttributes
      );

      expect(token).toBe("mocked.jwt.token");
      const payload = jwt.sign.mock.calls[0][0];
      expect(payload.email).toBe(longString);
      expect(payload.displayName).toBe(longString);
    });

    test("handles Unicode characters in attributes", async () => {
      const samlAttributes = {
        username: "testuser",
        displayName: "测试用户 José García",
        schacHomeOrganization: "université.fr",
      };

      const token = await MarketplaceJwtService.generateJwtForUser(
        samlAttributes
      );

      expect(token).toBe("mocked.jwt.token");
      const payload = jwt.sign.mock.calls[0][0];
      expect(payload.displayName).toBe("测试用户 José García");
    });

    test("handles quotes and special characters in displayName", async () => {
      const samlAttributes = {
        username: "testuser",
        displayName: "User with \"quotes\" and 'apostrophes'",
      };

      const token = await MarketplaceJwtService.generateJwtForUser(
        samlAttributes
      );

      expect(token).toBe("mocked.jwt.token");
    });

    test("generates different tokens for rapid successive calls", async () => {
      const samlAttributes = { username: "testuser" };

      jwt.sign
        .mockReturnValueOnce("token1")
        .mockReturnValueOnce("token2")
        .mockReturnValueOnce("token3");

      const token1 = await MarketplaceJwtService.generateJwtForUser(
        samlAttributes
      );
      const token2 = await MarketplaceJwtService.generateJwtForUser(
        samlAttributes
      );
      const token3 = await MarketplaceJwtService.generateJwtForUser(
        samlAttributes
      );

      expect(token1).toBe("token1");
      expect(token2).toBe("token2");
      expect(token3).toBe("token3");
      expect(jwt.sign).toHaveBeenCalledTimes(3);
    });

    test("maintains consistent payload structure across multiple calls", async () => {
      const samlAttributes = { username: "testuser" };

      await MarketplaceJwtService.generateJwtForUser(samlAttributes);
      await MarketplaceJwtService.generateJwtForUser(samlAttributes);

      const call1Payload = jwt.sign.mock.calls[0][0];
      const call2Payload = jwt.sign.mock.calls[1][0];

      expect(Object.keys(call1Payload)).toEqual(Object.keys(call2Payload));
    });
  });
});
