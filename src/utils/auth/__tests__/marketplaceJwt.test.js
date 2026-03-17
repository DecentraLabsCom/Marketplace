/** @jest-environment node */
// Ensure Node.js environment for tests
global.window = undefined;

// Mock dependencies BEFORE importing the service
jest.mock("jsonwebtoken");
jest.mock("@/utils/dev/logger", () => ({
  __esModule: true,
  default: {
    log: jest.fn(),
    error: jest.fn(),
  },
}));

let marketplaceJwtService;
let jwt;

describe('normalizeOrganizationDomain', () => {
  beforeEach(() => {
    jest.resetModules();
    jwt = require('jsonwebtoken');
    marketplaceJwtService = require('../marketplaceJwt').default;
  });
  test('normaliza dominio válido a minúsculas', () => {
    expect(marketplaceJwtService.normalizeOrganizationDomain('UNED.ES')).toBe('uned.es');
    expect(marketplaceJwtService.normalizeOrganizationDomain('Mi-Dominio.123')).toBe('mi-dominio.123');
  });
  test('lanza error si el dominio es vacío o no string', () => {
    expect(() => marketplaceJwtService.normalizeOrganizationDomain('')).toThrow('Organization domain is required');
    expect(() => marketplaceJwtService.normalizeOrganizationDomain(null)).toThrow('Organization domain is required');
    expect(() => marketplaceJwtService.normalizeOrganizationDomain(undefined)).toThrow('Organization domain is required');
  });
  test('lanza error si el dominio es muy corto o largo', () => {
    expect(() => marketplaceJwtService.normalizeOrganizationDomain('ab')).toThrow('Invalid organization domain length');
    expect(() => marketplaceJwtService.normalizeOrganizationDomain('a'.repeat(256))).toThrow('Invalid organization domain length');
  });
  test('lanza error si el dominio tiene caracteres inválidos', () => {
    expect(() => marketplaceJwtService.normalizeOrganizationDomain('inválido.com')).toThrow('Invalid character in organization domain');
    expect(() => marketplaceJwtService.normalizeOrganizationDomain('dominio@com')).toThrow('Invalid character in organization domain');
  });
});

  describe('generateInstitutionInviteToken', () => {
    const validPrivateKey =
      '-----BEGIN PRIVATE KEY-----\nTEST_KEY\n-----END PRIVATE KEY-----';
    beforeEach(() => {
      jest.resetModules();
      jwt = require('jsonwebtoken');
      marketplaceJwtService = require('../marketplaceJwt').default;
      marketplaceJwtService.privateKey = validPrivateKey;
      marketplaceJwtService.keyLoadAttempted = true;
      jwt.sign.mockReturnValue('mocked.jwt.token');
    });
    test('genera token válido con usuario y dominios', async () => {
      const samlUser = { id: 'user1', email: 'user1@org.com', affiliation: 'org.com' };
      const domains = ['Org.com', 'org.com'];
      const result = await marketplaceJwtService.generateInstitutionInviteToken({ samlUser, domains });
      // Debug log
      // eslint-disable-next-line no-console
      console.log('Result:', result);
      // eslint-disable-next-line no-console
      console.log('jwt.sign mock calls:', jwt.sign.mock.calls);
      expect(result && result.token).toBe('mocked.jwt.token');
      expect(result && result.payload.organizationDomains).toEqual(['org.com']);
      expect(result && result.payload.issuerUserId).toBe('user1');
    });
    test('lanza error si falta el usuario', async () => {
      await expect(marketplaceJwtService.generateInstitutionInviteToken({ samlUser: null, domains: ['org.com'] })).rejects.toThrow('SAML user is required for invite token');
    });
    test('lanza error si falta domains o está vacío', async () => {
      const samlUser = { id: 'user1' };
      await expect(marketplaceJwtService.generateInstitutionInviteToken({ samlUser, domains: [] })).rejects.toThrow('At least one organization domain is required for invite token');
      await expect(marketplaceJwtService.generateInstitutionInviteToken({ samlUser, domains: null })).rejects.toThrow('At least one organization domain is required for invite token');
    });
    test('lanza error si todos los dominios son inválidos', async () => {
      const samlUser = { id: 'user1' };
      await expect(marketplaceJwtService.generateInstitutionInviteToken({ samlUser, domains: ['@@@'] }))
        .rejects.toThrow('Institution invite token generation failed: Invalid character in organization domain');
    });
    test('lanza error si el wallet es inválido', async () => {
      const samlUser = { id: 'user1' };
      await expect(marketplaceJwtService.generateInstitutionInviteToken({ samlUser, domains: ['org.com'], expectedWallet: 'badwallet' })).rejects.toThrow('Invalid expected wallet address format');
    });
    test('genera token con wallet válido', async () => {
      const samlUser = { id: 'user1' };
      const domains = ['org.com'];
      const wallet = '0x1111111111111111111111111111111111111111';
      const result = await marketplaceJwtService.generateInstitutionInviteToken({ samlUser, domains, expectedWallet: wallet });
      // Debug log
      // eslint-disable-next-line no-console
      console.log('Result:', result);
      // eslint-disable-next-line no-console
      console.log('jwt.sign mock calls:', jwt.sign.mock.calls);
      expect(result && result.token).toBe('mocked.jwt.token');
      expect(result && result.payload.expectedWallet).toBe(wallet);
    });
    test('lanza error si no hay clave privada', async () => {
      marketplaceJwtService.privateKey = null;
      const samlUser = { id: 'user1' };
      await expect(marketplaceJwtService.generateInstitutionInviteToken({ samlUser, domains: ['org.com'] })).rejects.toThrow('JWT private key is not available for invite token');
    });
  });
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

import marketplaceJwtService from "../marketplaceJwt";
import jwt from "jsonwebtoken";

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
    marketplaceJwtService.privateKey = validPrivateKey;
    marketplaceJwtService.keyLoadAttempted = true;

    // Mock jwt.sign to return a token
    jwt.sign.mockReturnValue("mocked.jwt.token");
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.restoreAllMocks();
  });

  describe("Service Initialization", () => {
    test("service is exported as singleton", () => {
      expect(marketplaceJwtService).toBeDefined();
      expect(typeof marketplaceJwtService.generateJwtForUser).toBe("function");
      expect(typeof marketplaceJwtService.decodeToken).toBe("function");
      expect(typeof marketplaceJwtService.isConfigured).toBe("function");
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

          const token = await marketplaceJwtService.generateJwtForUser(
          samlAttributes
        );

        expect(token).toBe("mocked.jwt.token");
        expect(jwt.sign).toHaveBeenCalledWith(
          expect.objectContaining({
            sub: "testuser",
            email: "test@example.com",
            uid: "testuser",
            displayName: "Test User",
            schacHomeOrganization: "example.com",
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

          await marketplaceJwtService.generateJwtForUser(samlAttributes);

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

          await marketplaceJwtService.generateJwtForUser(samlAttributes);

        const payload = jwt.sign.mock.calls[0][0];

        expect(payload).toHaveProperty("sub");
        expect(payload).toHaveProperty("email");
        expect(payload).toHaveProperty("uid");
        expect(payload).toHaveProperty("displayName");
        expect(payload).toHaveProperty("schacHomeOrganization");
        expect(payload).toHaveProperty("eduPersonScopedAffiliation");
        expect(payload).toHaveProperty("iat");
        expect(payload).toHaveProperty("exp");
      });

      test("includes issuer from environment variable", async () => {
        process.env.JWT_ISSUER = "test-marketplace";
        const samlAttributes = { username: "testuser" };

          await marketplaceJwtService.generateJwtForUser(samlAttributes);

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

          await marketplaceJwtService.generateJwtForUser(samlAttributes);

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

          await marketplaceJwtService.generateJwtForUser(samlAttributes);

        const payload = jwt.sign.mock.calls[0][0];
        expect(payload.iat).toBe(1700000000); // Math.floor(1700000000000 / 1000)
        expect(payload.exp).toBeGreaterThan(payload.iat);
      });

      test("calculates expiration correctly with default 1 minute", async () => {
        const samlAttributes = { username: "testuser" };

          await marketplaceJwtService.generateJwtForUser(samlAttributes);

        const payload = jwt.sign.mock.calls[0][0];
        const expectedExp = payload.iat + 60; // 60 seconds (1 minute)
        expect(payload.exp).toBe(expectedExp);
      });

      test("uses custom expiration from environment variable", async () => {
        process.env.JWT_EXPIRATION_MS = "600000"; // 10 minutes
        const samlAttributes = { username: "testuser" };

          await marketplaceJwtService.generateJwtForUser(samlAttributes);

        const payload = jwt.sign.mock.calls[0][0];
        const expectedExp = payload.iat + 600; // 600 seconds
        expect(payload.exp).toBe(expectedExp);
      });
    });

    describe("Attribute handling and fallbacks", () => {
      test("uses username as uid claim", async () => {
        const samlAttributes = {
          username: "testuser",
        };

        await marketplaceJwtService.generateJwtForUser(samlAttributes);

        const payload = jwt.sign.mock.calls[0][0];
        expect(payload.uid).toBe("testuser");
        expect(payload.sub).toBe("testuser");
      });

      test("uses username as fallback for displayName when not provided", async () => {
        const samlAttributes = {
          username: "testuser",
        };

        await marketplaceJwtService.generateJwtForUser(samlAttributes);

        const payload = jwt.sign.mock.calls[0][0];
        expect(payload.displayName).toBe("testuser");
      });

      test("uses empty string for optional attributes when not provided", async () => {
        const samlAttributes = {
          username: "testuser",
        };

        await marketplaceJwtService.generateJwtForUser(samlAttributes);

        const payload = jwt.sign.mock.calls[0][0];
        expect(payload.email).toBe("");
        expect(payload.schacHomeOrganization).toBe("");
        expect(payload.eduPersonScopedAffiliation).toBe("");
      });

      test("ignores provided uid and keeps username as uid claim", async () => {
        const samlAttributes = {
          username: "testuser",
          uid: "custom-uid-123",
        };

        await marketplaceJwtService.generateJwtForUser(samlAttributes);

        const payload = jwt.sign.mock.calls[0][0];
        expect(payload.uid).toBe("testuser");
      });

      test("prefers provided displayName over username fallback", async () => {
        const samlAttributes = {
          username: "testuser",
          displayName: "Custom Display Name",
        };

        await marketplaceJwtService.generateJwtForUser(samlAttributes);

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

        await marketplaceJwtService.generateJwtForUser(samlAttributes);

        const payload = jwt.sign.mock.calls[0][0];
        expect(payload.sub).toBe("user123");
        expect(payload.email).toBe("user@test.com");
        expect(payload.uid).toBe("user123");
        expect(payload.displayName).toBe("Test User");
        expect(payload.schacHomeOrganization).toBe("test.edu");
        expect(payload.eduPersonScopedAffiliation).toBe("faculty@test.edu");
      });
    });

    describe("Error handling and validation", () => {
      test("throws error when username is missing", async () => {
        const samlAttributes = {
          email: "test@example.com",
        };

        await expect(
          marketplaceJwtService.generateJwtForUser(samlAttributes)
        ).rejects.toThrow("Username is required for JWT generation");
      });

      test("throws error when username is empty string", async () => {
        const samlAttributes = {
          username: "",
        };

        await expect(
          marketplaceJwtService.generateJwtForUser(samlAttributes)
        ).rejects.toThrow("Username is required for JWT generation");
      });

      test("throws error when samlAttributes is null", async () => {
        await expect(
          marketplaceJwtService.generateJwtForUser(null)
        ).rejects.toThrow("Username is required for JWT generation");
      });

      test("throws error when samlAttributes is undefined", async () => {
        await expect(
          marketplaceJwtService.generateJwtForUser(undefined)
        ).rejects.toThrow("Username is required for JWT generation");
      });

      test("throws error when private key is not available", async () => {
        marketplaceJwtService.privateKey = null;
        const samlAttributes = { username: "testuser" };

        // Can throw either message depending on test environment
        await expect(
          marketplaceJwtService.generateJwtForUser(samlAttributes)
        ).rejects.toThrow("JWT");
      });

      test("wraps jwt.sign errors with descriptive message", async () => {
        jwt.sign.mockImplementation(() => {
          throw new Error("Invalid key format");
        });

        const samlAttributes = { username: "testuser" };

        await expect(
          marketplaceJwtService.generateJwtForUser(samlAttributes)
        ).rejects.toThrow("JWT generation failed: Invalid key format");
      });

      test("handles jwt.sign throwing non-Error objects", async () => {
        jwt.sign.mockImplementation(() => {
          throw "String error";
        });

        const samlAttributes = { username: "testuser" };

        await expect(
          marketplaceJwtService.generateJwtForUser(samlAttributes)
        ).rejects.toThrow("JWT generation failed");
      });
    });
  });

  describe("generateSamlAuthToken", () => {
    test("generates JWT with required SAML auth claims", async () => {
      const token = await marketplaceJwtService.generateSamlAuthToken({
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
        marketplaceJwtService.generateSamlAuthToken({
          affiliation: "uned.es",
        })
      ).rejects.toThrow("userId is required for SAML auth token generation");
    });

    test("uses empty affiliation when missing", async () => {
      const token = await marketplaceJwtService.generateSamlAuthToken({
        userId: "user-1",
      });

      expect(token).toBe("mocked.jwt.token");
      expect(jwt.sign).toHaveBeenCalledWith(
        expect.objectContaining({
          userid: "user-1",
          affiliation: "",
        }),
        validPrivateKey,
        expect.objectContaining({ algorithm: "RS256" })
      );
    });

    test("throws error for invalid institutional wallet format", async () => {
      await expect(
        marketplaceJwtService.generateSamlAuthToken({
          userId: "user-1",
          affiliation: "uned.es",
          institutionalProviderWallet: "invalid-wallet",
        })
      ).rejects.toThrow("Invalid institutionalProviderWallet address format");
    });

    test('uses default audience when none provided', async () => {
      // no env vars set
      await marketplaceJwtService.generateSamlAuthToken({
        userId: 'user-default',
      });

      expect(jwt.sign).toHaveBeenCalledWith(
        expect.any(Object),
        expect.any(String),
        expect.objectContaining({
          audience: 'blockchain-services',
        })
      );
    });

    test('passes audience and subject through to jwt.sign', async () => {
      await marketplaceJwtService.generateSamlAuthToken({
        userId: 'user-2',
        affiliation: 'aff',
        institutionalProviderWallet: '0x1111111111111111111111111111111111111111',
        audience: 'custom-audience',
      });

      expect(jwt.sign).toHaveBeenCalledWith(
        expect.any(Object),
        expect.any(String),
        expect.objectContaining({
          audience: 'custom-audience',
          subject: 'user-2',
        })
      );
    });

    test('generateIntentBackendToken defaults to 60 seconds when no env var or param', async () => {
      // Ensure deterministic time
      jest.spyOn(Date, 'now').mockReturnValue(1700000000000);
      delete process.env.INTENTS_JWT_EXPIRATION_SECONDS;

      const result = await marketplaceJwtService.generateIntentBackendToken();

      expect(result.token).toBe('mocked.jwt.token');
      const expectedExpiresAt = new Date((1700000000 + 60) * 1000).toISOString();
      expect(result.expiresAt).toBe(expectedExpiresAt);
    });

    test('generateIntentBackendToken defaults audience to blockchain-services', async () => {
      jest.spyOn(Date, 'now').mockReturnValue(1700000000000);
      await marketplaceJwtService.generateIntentBackendToken();
      expect(jwt.sign).toHaveBeenCalledWith(
        expect.any(Object),
        expect.any(String),
        expect.objectContaining({ audience: 'blockchain-services' })
      );
    });

    test('generateIntentBackendToken respects expiresInSeconds parameter', async () => {
      jest.spyOn(Date, 'now').mockReturnValue(1700000000000);

      const result = await marketplaceJwtService.generateIntentBackendToken({ expiresInSeconds: 30 });

      expect(result.token).toBe('mocked.jwt.token');
      const expectedExpiresAt = new Date((1700000000 + 30) * 1000).toISOString();
      expect(result.expiresAt).toBe(expectedExpiresAt);
    });

    test('generateIntentBackendToken includes audience/subject and extra claims', async () => {
      jest.spyOn(Date, 'now').mockReturnValue(1700000000000);
      const extra = { foo: 'bar', sub: 'hacked', aud: 'no', scope: 'nope' };

      await marketplaceJwtService.generateIntentBackendToken({
        audience: 'my-aud',
        subject: 'my-sub',
        claims: extra,
      });

      // verify that reserved keys were removed and custom claim kept
      const payload = jwt.sign.mock.calls[0][0];
      expect(payload.foo).toBe('bar');
      expect(payload.sub).toEqual(undefined);
      expect(payload.aud).toEqual(undefined);
      expect(payload.scope).toBeDefined();

      expect(jwt.sign).toHaveBeenCalledWith(
        expect.any(Object),
        expect.any(String),
        expect.objectContaining({
          audience: 'my-aud',
          subject: 'my-sub',
        })
      );
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

      const result = marketplaceJwtService.decodeToken("valid.jwt.token");

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

      const result = marketplaceJwtService.decodeToken("token");

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

      expect(() => marketplaceJwtService.decodeToken("invalid.token")).toThrow(
        "JWT decode failed: Malformed token"
      );
    });

    test("handles null token", () => {
      jwt.decode.mockImplementation(() => {
        throw new Error("Token required");
      });

      expect(() => marketplaceJwtService.decodeToken(null)).toThrow(
        "JWT decode failed: Token required"
      );
    });

    test("handles empty string token", () => {
      jwt.decode.mockImplementation(() => {
        throw new Error("Invalid token");
      });

      expect(() => marketplaceJwtService.decodeToken("")).toThrow(
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

        const token = await marketplaceJwtService.generateJwtForUser(
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

      const token = await marketplaceJwtService.generateJwtForUser(
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

      const token = await marketplaceJwtService.generateJwtForUser(
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

      const token = await marketplaceJwtService.generateJwtForUser(
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

      const token1 = await marketplaceJwtService.generateJwtForUser(
        samlAttributes
      );
      const token2 = await marketplaceJwtService.generateJwtForUser(
        samlAttributes
      );
      const token3 = await marketplaceJwtService.generateJwtForUser(
        samlAttributes
      );

      expect(token1).toBe("token1");
      expect(token2).toBe("token2");
      expect(token3).toBe("token3");
      expect(jwt.sign).toHaveBeenCalledTimes(3);
    });

    test("maintains consistent payload structure across multiple calls", async () => {
      const samlAttributes = { username: "testuser" };

      await marketplaceJwtService.generateJwtForUser(samlAttributes);
      await marketplaceJwtService.generateJwtForUser(samlAttributes);

      const call1Payload = jwt.sign.mock.calls[0][0];
      const call2Payload = jwt.sign.mock.calls[1][0];

      expect(Object.keys(call1Payload)).toEqual(Object.keys(call2Payload));
    });
  });
});
