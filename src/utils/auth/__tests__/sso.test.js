/**
 * Unit Tests for SSO (SAML) Utilities
 *
 * Tests SAML authentication functions including session management,
 * service provider configuration, identity provider setup, and SAML response parsing.
 *
 * Tests Coverage:
 * - Session creation with proper cookie configuration
 * - Service Provider initialization with environment variables
 * - Identity Provider metadata parsing and configuration
 * - SAML response parsing with various attribute formats
 * - Error handling in SAML assertion process
 * - Edge cases (missing data, malformed XML, optional attributes)
 */

import { ServiceProvider, IdentityProvider } from "saml2-js";
import xml2js from "xml2js";
import {
  createSession,
  createServiceProvider,
  createIdentityProvider,
  parseSAMLResponse,
} from "../sso";

// Mock dependencies
jest.mock("saml2-js");
jest.mock("xml2js");
jest.mock("@/utils/dev/logger", () => ({
  __esModule: true,
  default: {
    error: jest.fn(),
    log: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
  },
}));

// Mock jsonwebtoken for sessionCookie
jest.mock("jsonwebtoken", () => ({
  sign: jest.fn((payload, secret, options) => {
    // Return a mock JWT that encodes the payload for testing
    return `mock-jwt-${JSON.stringify(payload)}`;
  }),
  verify: jest.fn((token, secret, options) => {
    // Extract payload from mock JWT
    if (token.startsWith('mock-jwt-')) {
      return JSON.parse(token.replace('mock-jwt-', ''));
    }
    throw new Error('Invalid token');
  }),
}));

// Mock fetch globally
global.fetch = jest.fn();

describe("SSO Utilities", () => {
  // Store original env
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();

    // Reset process.env with default test values
    process.env = {
      ...originalEnv,
      NODE_ENV: "test",
      SAML_SP_PRIVATE_KEY: "test-private-key\\nwith-newlines",
      SAML_SP_CERTIFICATE: "test-certificate\\nwith-newlines",
      NEXT_PUBLIC_SAML_SP_METADATA_URL: "https://sp.example.com/metadata",
      NEXT_PUBLIC_SAML_SP_CALLBACK_URL: "https://sp.example.com/callback",
      NEXT_PUBLIC_SAML_IDP_METADATA_URL: "https://idp.example.com/metadata",
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("createSession", () => {
    test("creates session cookie with signed JWT token", () => {
      const mockResponse = {
        cookies: {
          set: jest.fn(),
        },
      };

      const userData = {
        id: "user123",
        email: "user@example.com",
        name: "Test User",
      };

      createSession(mockResponse, userData);

      // Verify cookie was set with JWT token (not plain JSON)
      expect(mockResponse.cookies.set).toHaveBeenCalledWith(
        "user_session",
        expect.stringContaining("mock-jwt-"), // JWT token
        expect.objectContaining({
          httpOnly: true,
          sameSite: "strict",
          path: "/",
        })
      );
    });

    test("sets secure flag in production environment", () => {
      process.env.NODE_ENV = "production";
      // Set SESSION_SECRET for production mode
      process.env.SESSION_SECRET = "test-session-secret-at-least-32-chars-long";

      const mockResponse = {
        cookies: {
          set: jest.fn(),
        },
      };

      const userData = { id: "user123", email: "user@example.com" };

      createSession(mockResponse, userData);

      expect(mockResponse.cookies.set).toHaveBeenCalledWith(
        "user_session",
        expect.any(String),
        expect.objectContaining({
          secure: true,
        })
      );
    });

    test("handles complex user data object", () => {
      const mockResponse = {
        cookies: {
          set: jest.fn(),
        },
      };

      const complexUserData = {
        id: "user123",
        email: "user@example.com",
        name: "Test User",
        affiliation: "university.edu",
        role: "student",
        organizationName: "Test University",
      };

      createSession(mockResponse, complexUserData);

      // Verify the JWT token contains the user data
      const callArgs = mockResponse.cookies.set.mock.calls[0];
      const token = callArgs[1];
      expect(token).toContain("mock-jwt-");
      expect(token).toContain("user123");
      expect(token).toContain("user@example.com");
    });
  });

  describe("createServiceProvider", () => {
    test("creates ServiceProvider with correct configuration", () => {
      const mockSP = { entity_id: "test-sp" };
      ServiceProvider.mockImplementation(() => mockSP);

      const result = createServiceProvider();

      expect(ServiceProvider).toHaveBeenCalledWith({
        entity_id: "https://sp.example.com/metadata",
        assert_endpoint: "https://sp.example.com/callback",
        private_key: "test-private-key\nwith-newlines",
        certificate: "test-certificate\nwith-newlines",
        allow_unencrypted_assertion: true,
      });

      expect(result).toBe(mockSP);
    });

    test("replaces escaped newlines in private key and certificate", () => {
      process.env.SAML_SP_PRIVATE_KEY = "line1\\nline2\\nline3";
      process.env.SAML_SP_CERTIFICATE = "cert1\\ncert2\\ncert3";

      ServiceProvider.mockImplementation(() => ({}));

      createServiceProvider();

      expect(ServiceProvider).toHaveBeenCalledWith(
        expect.objectContaining({
          private_key: "line1\nline2\nline3",
          certificate: "cert1\ncert2\ncert3",
        })
      );
    });

    test("handles missing environment variables gracefully", () => {
      delete process.env.SAML_SP_PRIVATE_KEY;
      delete process.env.SAML_SP_CERTIFICATE;

      ServiceProvider.mockImplementation(() => ({}));

      createServiceProvider();

      expect(ServiceProvider).toHaveBeenCalledWith(
        expect.objectContaining({
          private_key: "",
          certificate: "",
        })
      );
    });

    test("handles undefined environment variables", () => {
      process.env.SAML_SP_PRIVATE_KEY = undefined;
      process.env.SAML_SP_CERTIFICATE = undefined;

      ServiceProvider.mockImplementation(() => ({}));

      createServiceProvider();

      expect(ServiceProvider).toHaveBeenCalledWith(
        expect.objectContaining({
          private_key: "",
          certificate: "",
        })
      );
    });
  });

  describe("createIdentityProvider", () => {
    const mockMetadataXML = `<?xml version="1.0"?>
      <md:EntityDescriptor xmlns:md="urn:oasis:names:tc:SAML:2.0:metadata">
        <md:IDPSSODescriptor>
          <md:SingleSignOnService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect" Location="https://idp.example.com/sso"/>
          <md:SingleLogoutService Location="https://idp.example.com/logout"/>
          <md:KeyDescriptor>
            <ds:KeyInfo xmlns:ds="http://www.w3.org/2000/09/xmldsig#">
              <ds:X509Data>
                <ds:X509Certificate>MIIC8DCCAdigAwIBAgIQBQa</ds:X509Certificate>
              </ds:X509Data>
            </ds:KeyInfo>
          </md:KeyDescriptor>
        </md:IDPSSODescriptor>
      </md:EntityDescriptor>`;

    beforeEach(() => {
      global.fetch.mockResolvedValue({
        text: jest.fn().mockResolvedValue(mockMetadataXML),
      });
    });

    test("fetches and parses IDP metadata", async () => {
      xml2js.parseStringPromise.mockResolvedValue({
        "md:EntityDescriptor": {
          "md:IDPSSODescriptor": {
            "md:SingleSignOnService": {
              $: {
                Binding: "urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect",
                Location: "https://idp.example.com/sso",
              },
            },
            "md:SingleLogoutService": {
              $: { Location: "https://idp.example.com/logout" },
            },
            "md:KeyDescriptor": {
              "ds:KeyInfo": {
                "ds:X509Data": {
                  "ds:X509Certificate": "MIIC8DCCAdigAwIBAgIQBQa",
                },
              },
            },
          },
        },
      });

      const mockIDP = { sso_login_url: "test-url" };
      IdentityProvider.mockImplementation(() => mockIDP);

      const result = await createIdentityProvider();

      expect(global.fetch).toHaveBeenCalledWith(
        "https://idp.example.com/metadata"
      );
      expect(xml2js.parseStringPromise).toHaveBeenCalledWith(mockMetadataXML, {
        explicitArray: false,
      });
      expect(result).toBe(mockIDP);
    });

    test("creates IdentityProvider with correct URLs and certificates", async () => {
      xml2js.parseStringPromise.mockResolvedValue({
        "md:EntityDescriptor": {
          "md:IDPSSODescriptor": {
            "md:SingleSignOnService": {
              $: {
                Binding: "urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect",
                Location: "https://idp.example.com/sso",
              },
            },
            "md:SingleLogoutService": {
              $: { Location: "https://idp.example.com/logout" },
            },
            "md:KeyDescriptor": {
              "ds:KeyInfo": {
                "ds:X509Data": {
                  "ds:X509Certificate": "MIIC8DCCAdigAwIBAgIQBQa",
                },
              },
            },
          },
        },
      });

      IdentityProvider.mockImplementation(() => ({}));

      await createIdentityProvider();

      expect(IdentityProvider).toHaveBeenCalledWith({
        sso_login_url: "https://idp.example.com/sso",
        sso_logout_url: "https://idp.example.com/logout",
        certificates: [
          "-----BEGIN CERTIFICATE-----\nMIIC8DCCAdigAwIBAgIQBQa\n-----END CERTIFICATE-----",
        ],
      });
    });

    test("handles multiple SingleSignOnService entries", async () => {
      xml2js.parseStringPromise.mockResolvedValue({
        "md:EntityDescriptor": {
          "md:IDPSSODescriptor": {
            "md:SingleSignOnService": [
              {
                $: {
                  Binding: "urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST",
                  Location: "https://idp.example.com/sso-post",
                },
              },
              {
                $: {
                  Binding: "urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect",
                  Location: "https://idp.example.com/sso-redirect",
                },
              },
            ],
            "md:SingleLogoutService": {
              $: { Location: "https://idp.example.com/logout" },
            },
            "md:KeyDescriptor": {
              "ds:KeyInfo": {
                "ds:X509Data": {
                  "ds:X509Certificate": "ABC123",
                },
              },
            },
          },
        },
      });

      IdentityProvider.mockImplementation(() => ({}));

      await createIdentityProvider();

      expect(IdentityProvider).toHaveBeenCalledWith(
        expect.objectContaining({
          sso_login_url: "https://idp.example.com/sso-redirect",
        })
      );
    });

    test("handles multiple KeyDescriptors", async () => {
      xml2js.parseStringPromise.mockResolvedValue({
        "md:EntityDescriptor": {
          "md:IDPSSODescriptor": {
            "md:SingleSignOnService": {
              $: {
                Binding: "urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect",
                Location: "https://idp.example.com/sso",
              },
            },
            "md:SingleLogoutService": {
              $: { Location: "https://idp.example.com/logout" },
            },
            "md:KeyDescriptor": [
              {
                "ds:KeyInfo": {
                  "ds:X509Data": {
                    "ds:X509Certificate": "CERT1",
                  },
                },
              },
              {
                "ds:KeyInfo": {
                  "ds:X509Data": {
                    "ds:X509Certificate": "CERT2",
                  },
                },
              },
            ],
          },
        },
      });

      IdentityProvider.mockImplementation(() => ({}));

      await createIdentityProvider();

      expect(IdentityProvider).toHaveBeenCalledWith(
        expect.objectContaining({
          certificates: [
            "-----BEGIN CERTIFICATE-----\nCERT1\n-----END CERTIFICATE-----",
            "-----BEGIN CERTIFICATE-----\nCERT2\n-----END CERTIFICATE-----",
          ],
        })
      );
    });

    test("formats certificates correctly with 64-character lines", async () => {
      const longCert = "A".repeat(128); // 128 characters

      xml2js.parseStringPromise.mockResolvedValue({
        "md:EntityDescriptor": {
          "md:IDPSSODescriptor": {
            "md:SingleSignOnService": {
              $: {
                Binding: "urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect",
                Location: "https://idp.example.com/sso",
              },
            },
            "md:SingleLogoutService": {
              $: { Location: "https://idp.example.com/logout" },
            },
            "md:KeyDescriptor": {
              "ds:KeyInfo": {
                "ds:X509Data": {
                  "ds:X509Certificate": `  ${longCert}  `, // With whitespace
                },
              },
            },
          },
        },
      });

      IdentityProvider.mockImplementation(() => ({}));

      await createIdentityProvider();

      const expectedCert = `-----BEGIN CERTIFICATE-----\n${"A".repeat(
        64
      )}\n${"A".repeat(64)}\n-----END CERTIFICATE-----`;

      expect(IdentityProvider).toHaveBeenCalledWith(
        expect.objectContaining({
          certificates: [expectedCert],
        })
      );
    });

    test("handles multiple SingleLogoutService entries", async () => {
      xml2js.parseStringPromise.mockResolvedValue({
        "md:EntityDescriptor": {
          "md:IDPSSODescriptor": {
            "md:SingleSignOnService": {
              $: {
                Binding: "urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect",
                Location: "https://idp.example.com/sso",
              },
            },
            "md:SingleLogoutService": [
              { $: { Location: "https://idp.example.com/logout1" } },
              { $: { Location: "https://idp.example.com/logout2" } },
            ],
            "md:KeyDescriptor": {
              "ds:KeyInfo": {
                "ds:X509Data": {
                  "ds:X509Certificate": "ABC",
                },
              },
            },
          },
        },
      });

      IdentityProvider.mockImplementation(() => ({}));

      await createIdentityProvider();

      expect(IdentityProvider).toHaveBeenCalledWith(
        expect.objectContaining({
          sso_logout_url: "https://idp.example.com/logout1",
        })
      );
    });
  });

  describe("parseSAMLResponse", () => {
    let mockSP;
    let mockIDP;

    beforeEach(() => {
      mockSP = {
        post_assert: jest.fn(),
      };
      mockIDP = { sso_login_url: "test" };

      ServiceProvider.mockImplementation(() => mockSP);
      IdentityProvider.mockImplementation(() => mockIDP);

      global.fetch.mockResolvedValue({
        text: jest.fn().mockResolvedValue("<xml/>"),
      });

      xml2js.parseStringPromise.mockResolvedValue({
        "md:EntityDescriptor": {
          "md:IDPSSODescriptor": {
            "md:SingleSignOnService": {
              $: {
                Binding: "urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect",
                Location: "https://idp.example.com/sso",
              },
            },
            "md:SingleLogoutService": {
              $: { Location: "https://idp.example.com/logout" },
            },
            "md:KeyDescriptor": {
              "ds:KeyInfo": {
                "ds:X509Data": {
                  "ds:X509Certificate": "CERT",
                },
              },
            },
          },
        },
      });
    });

    test("parses SAML response and extracts user data", async () => {
      const mockSAMLAssertion = {
        user: {
          attributes: {
            uid: "user123",
            mail: "user@example.com",
            displayName: "Test User",
            schacHomeOrganization: "university.edu",
            eduPersonAffiliation: "student",
            eduPersonScopedAffiliation: "student@university.edu",
            schacHomeOrganizationType:
              "urn:schac:homeOrganizationType:eu:higherEducationalInstitution",
            schacPersonalUniqueCode:
              "urn:schac:personalUniqueCode:es:dni:12345678A",
            organizationName: "Test University",
          },
        },
      };

      mockSP.post_assert.mockImplementation((idp, options, callback) => {
        callback(null, mockSAMLAssertion);
      });

      const result = await parseSAMLResponse("saml-response-data");

      expect(result).toEqual({
        id: "user123",
        email: "user@example.com",
        name: "Test User",
        authType: "sso",
        isSSO: true,
        affiliation: "university.edu",
        role: "student",
        scopedRole: "student@university.edu",
        organizationType:
          "urn:schac:homeOrganizationType:eu:higherEducationalInstitution",
        personalUniqueCode: "urn:schac:personalUniqueCode:es:dni:12345678A",
        organizationName: "Test University",
        samlAssertion: "saml-response-data",
      });
    });

    test("handles array attributes correctly", async () => {
      const mockSAMLAssertion = {
        user: {
          attributes: {
            uid: ["user123", "alt-id"],
            mail: ["primary@example.com", "secondary@example.com"],
            displayName: ["Primary Name", "Alt Name"],
            schacHomeOrganization: ["org1.edu", "org2.edu"],
          },
        },
      };

      mockSP.post_assert.mockImplementation((idp, options, callback) => {
        callback(null, mockSAMLAssertion);
      });

      const result = await parseSAMLResponse("saml-response-data");

      // Should extract first element from arrays
      expect(result.id).toBe("user123");
      expect(result.email).toBe("primary@example.com");
      expect(result.name).toBe("Primary Name");
      expect(result.affiliation).toBe("org1.edu");
    });

    test("handles missing optional organizationName attribute", async () => {
      const mockSAMLAssertion = {
        user: {
          attributes: {
            uid: "user123",
            mail: "user@example.com",
            displayName: "Test User",
            schacHomeOrganization: "university.edu",
            // organizationName is missing
          },
        },
      };

      mockSP.post_assert.mockImplementation((idp, options, callback) => {
        callback(null, mockSAMLAssertion);
      });

      const result = await parseSAMLResponse("saml-response-data");

      expect(result.organizationName).toBeNull();
    });

    test("handles organizationName as array", async () => {
      const mockSAMLAssertion = {
        user: {
          attributes: {
            uid: "user123",
            mail: "user@example.com",
            displayName: "Test User",
            organizationName: ["University A", "University B"],
          },
        },
      };

      mockSP.post_assert.mockImplementation((idp, options, callback) => {
        callback(null, mockSAMLAssertion);
      });

      const result = await parseSAMLResponse("saml-response-data");

      expect(result.organizationName).toBe("University A");
    });

    test("calls post_assert with correct parameters", async () => {
      mockSP.post_assert.mockImplementation((idp, options, callback) => {
        callback(null, { user: { attributes: {} } });
      });

      await parseSAMLResponse("test-saml-response");

      expect(mockSP.post_assert).toHaveBeenCalledWith(
        mockIDP,
        { request_body: { SAMLResponse: "test-saml-response" } },
        expect.any(Function)
      );
    });

    test("rejects promise on SAML assertion error", async () => {
      const assertionError = new Error("Invalid SAML assertion");

      mockSP.post_assert.mockImplementation((idp, options, callback) => {
        callback(assertionError, null);
      });

      await expect(parseSAMLResponse("invalid-saml")).rejects.toThrow(
        "Invalid SAML assertion"
      );
    });

    test("handles missing attributes gracefully", async () => {
      const mockSAMLAssertion = {
        user: {
          attributes: {
            uid: "user123",
            // Most attributes missing
          },
        },
      };

      mockSP.post_assert.mockImplementation((idp, options, callback) => {
        callback(null, mockSAMLAssertion);
      });

      const result = await parseSAMLResponse("saml-response");

      expect(result).toEqual({
        id: "user123",
        email: null,
        name: null,
        authType: "sso",
        isSSO: true,
        affiliation: null,
        role: null,
        scopedRole: null,
        organizationType: null,
        personalUniqueCode: null,
        organizationName: null,
        samlAssertion: "saml-response",
      });
    });

    test("handles empty attributes object", async () => {
      const mockSAMLAssertion = {
        user: {
          attributes: {},
        },
      };

      mockSP.post_assert.mockImplementation((idp, options, callback) => {
        callback(null, mockSAMLAssertion);
      });

      const result = await parseSAMLResponse("saml-response");

      expect(result.id).toBeNull();
      expect(result.organizationName).toBeNull();
    });

    test("handles missing user object in assertion", async () => {
      const mockSAMLAssertion = {
        // No user object
      };

      mockSP.post_assert.mockImplementation((idp, options, callback) => {
        callback(null, mockSAMLAssertion);
      });

      const result = await parseSAMLResponse("saml-response");

      expect(result.id).toBeNull();
      expect(result.organizationName).toBeNull();
    });
  });

  describe("Edge Cases", () => {
    test("createServiceProvider handles null environment variables", () => {
      process.env.SAML_SP_PRIVATE_KEY = null;
      process.env.SAML_SP_CERTIFICATE = null;

      ServiceProvider.mockImplementation(() => ({}));

      expect(() => createServiceProvider()).not.toThrow();
    });

    test("createIdentityProvider handles fetch failure", async () => {
      global.fetch.mockRejectedValue(new Error("Network error"));

      await expect(createIdentityProvider()).rejects.toThrow("Network error");
    });

    test("createIdentityProvider handles XML parsing failure", async () => {
      global.fetch.mockResolvedValue({
        text: jest.fn().mockResolvedValue("<invalid xml"),
      });

      xml2js.parseStringPromise.mockRejectedValue(new Error("XML parse error"));

      await expect(createIdentityProvider()).rejects.toThrow("XML parse error");
    });

    test("parseSAMLResponse handles null SAML response", async () => {
      ServiceProvider.mockImplementation(() => ({
        post_assert: jest.fn((idp, options, callback) => {
          callback(new Error("Invalid input"), null);
        }),
      }));

      IdentityProvider.mockImplementation(() => ({}));

      global.fetch.mockResolvedValue({
        text: jest.fn().mockResolvedValue("<xml/>"),
      });

      xml2js.parseStringPromise.mockResolvedValue({
        "md:EntityDescriptor": {
          "md:IDPSSODescriptor": {
            "md:SingleSignOnService": {
              $: {
                Binding: "urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect",
                Location: "https://idp.example.com/sso",
              },
            },
            "md:SingleLogoutService": {
              $: { Location: "https://idp.example.com/logout" },
            },
            "md:KeyDescriptor": {
              "ds:KeyInfo": {
                "ds:X509Data": {
                  "ds:X509Certificate": "CERT",
                },
              },
            },
          },
        },
      });

      await expect(parseSAMLResponse(null)).rejects.toThrow("Invalid input");
    });
  });
});
