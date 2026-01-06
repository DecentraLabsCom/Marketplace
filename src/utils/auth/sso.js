import { ServiceProvider, IdentityProvider } from 'saml2-js'
import xml2js from 'xml2js'
import countries from 'i18n-iso-countries'
import enLocale from 'i18n-iso-countries/langs/en.json'
import esLocale from 'i18n-iso-countries/langs/es.json'
import devLog from '@/utils/dev/logger'
import { createSessionCookie } from './sessionCookie'

let countriesInitialized = false

function ensureCountryLocales() {
  if (countriesInitialized) return
  countries.registerLocale(enLocale)
  countries.registerLocale(esLocale)
  countriesInitialized = true
}

function normalizeCountryCode(value) {
  if (!value || typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return null
  if (trimmed.length === 2) return trimmed.toUpperCase()
  ensureCountryLocales()
  return (
    countries.getAlpha2Code(trimmed, 'en') ||
    countries.getAlpha2Code(trimmed, 'es') ||
    null
  )
}

export async function createSession(response, userData) {
  // Create a signed JWT cookie with the user information
  const cookieConfigs = createSessionCookie(userData);
  const configs = Array.isArray(cookieConfigs) ? cookieConfigs : [cookieConfigs];
  configs.forEach((cookieConfig) => {
    response.cookies.set(cookieConfig.name, cookieConfig.value, {
      httpOnly: cookieConfig.httpOnly,
      secure: cookieConfig.secure,
      sameSite: cookieConfig.sameSite,
      path: cookieConfig.path,
      maxAge: cookieConfig.maxAge,
    });
  });
}

export function createServiceProvider() {
  const privateKey = process.env.SAML_SP_PRIVATE_KEY?.replace(/\\n/g, "\n") ?? "";
  const certificate = process.env.SAML_SP_CERTIFICATE?.replace(/\\n/g, "\n") ?? "";
  
  const sp = new ServiceProvider({
    entity_id: process.env.NEXT_PUBLIC_SAML_SP_METADATA_URL,
    assert_endpoint: process.env.NEXT_PUBLIC_SAML_SP_CALLBACK_URL,
    private_key: privateKey,
    certificate: certificate,
    allow_unencrypted_assertion: true,
  });

  /*sp.createSingleLogoutServiceUrl = function (options) {
    const { request_body } = options;
    const { SAMLRequest, RelayState } = request_body;
    const baseUrl = process.env.NEXT_PUBLIC_SAML_SP_LOGOUT_URL;
    return `${baseUrl}?SAMLRequest=${SAMLRequest}&RelayState=${RelayState}`;
  };*/

  return sp;
}

export async function createIdentityProvider() {
  const res = await fetch(process.env.NEXT_PUBLIC_SAML_IDP_METADATA_URL);
  const metadata = await res.text();
  
  // Parse XML
  const parsed = await xml2js.parseStringPromise(metadata, { explicitArray: false });

  // Navigate through the object to extract values
  const idpSSO = parsed["md:EntityDescriptor"]["md:IDPSSODescriptor"];
  const ssoServices = Array.isArray(idpSSO["md:SingleSignOnService"])
    ? idpSSO["md:SingleSignOnService"]
    : [idpSSO["md:SingleSignOnService"]];
  const sso_login_url = ssoServices.find(s => s.$.Binding.includes("HTTP-Redirect")).$.Location;

  const sloServices = idpSSO["md:SingleLogoutService"];
  const sso_logout_url = Array.isArray(sloServices)
    ? sloServices[0].$.Location
    : sloServices?.$.Location;

  const keyDescriptors = Array.isArray(idpSSO["md:KeyDescriptor"])
    ? idpSSO["md:KeyDescriptor"]
    : [idpSSO["md:KeyDescriptor"]];
  
  const certificates = keyDescriptors
    .map(k => k["ds:KeyInfo"]["ds:X509Data"]["ds:X509Certificate"])
    .filter(Boolean)
    .map(cert => {
      const clean = cert.replace(/\s+/g, '');
      const formatted = clean.match(/.{1,64}/g).join('\n');
      return `-----BEGIN CERTIFICATE-----\n${formatted}\n-----END CERTIFICATE-----`;
    });

  return new IdentityProvider({
    sso_login_url,
    sso_logout_url,
    certificates,
  });
}

export async function parseSAMLResponse(samlResponse) {
  const sp = createServiceProvider();
  const idp = await createIdentityProvider();

  const getFirstAttribute = (attributes, keys) => {
    for (const key of keys) {
      const raw = attributes?.[key];
      const value = Array.isArray(raw) ? raw[0] : raw;
      if (value) return value;
    }
    return null;
  };

  return new Promise((resolve, reject) => {
    sp.post_assert(idp, { request_body: { SAMLResponse: samlResponse } }, (err, samlAssertion) => {
      if (err) {
        devLog.error("SAML Assertion Error:", err);
        return reject(err);
      }

      const attrs = samlAssertion?.user?.attributes || {};
      
      // Debug: log available attributes for troubleshooting
      console.log('[SAML] Available attributes: ' + Object.keys(attrs));
      
      const country = getFirstAttribute(attrs, [
        'c',
        'co',
        'country',
        'countryCode',
        'countryName',
        'countryOfResidence',
        'countryOfCitizenship',
        'urn:oid:2.5.4.6',
        'schacCountryOfResidence',
        'schacCountryOfCitizenship',
        'urn:oid:1.3.6.1.4.1.25178.1.2.9',
        'urn:oid:1.3.6.1.4.1.25178.1.2.10',
      ]);
      const normalizedCountry = normalizeCountryCode(country);

      // Get schacHomeOrganization (try multiple attribute names/OIDs)
      let affiliation = getFirstAttribute(attrs, [
        'schacHomeOrganization',
        'urn:oid:1.3.6.1.4.1.25178.1.2.9', // SCHAC OID for schacHomeOrganization
      ]);
      
      // Fallback: extract domain from eduPersonScopedAffiliation (e.g., "student@uned.es" -> "uned.es")
      if (!affiliation) {
        const scopedAff = getFirstAttribute(attrs, [
          'eduPersonScopedAffiliation',
          'urn:oid:1.3.6.1.4.1.5923.1.1.1.9',
        ]);
        if (scopedAff && scopedAff.includes('@')) {
          affiliation = scopedAff.split('@')[1];
          devLog.log('[SAML] Derived affiliation from eduPersonScopedAffiliation:', affiliation);
        }
      }

      // Get user information from the assertion
      const userData = {
        id: getFirstAttribute(attrs, ['uid', 'urn:oid:0.9.2342.19200300.100.1.1']),
        email: getFirstAttribute(attrs, ['mail', 'urn:oid:0.9.2342.19200300.100.1.3']),
        name: getFirstAttribute(attrs, ['displayName', 'urn:oid:2.16.840.1.113730.3.1.241']),
        authType: 'sso',
        isSSO: true,
        affiliation,
        role: getFirstAttribute(attrs, ['eduPersonAffiliation', 'urn:oid:1.3.6.1.4.1.5923.1.1.1.1']),
        scopedRole: getFirstAttribute(attrs, ['eduPersonScopedAffiliation', 'urn:oid:1.3.6.1.4.1.5923.1.1.1.9']),
        organizationType: getFirstAttribute(attrs, ['schacHomeOrganizationType', 'urn:oid:1.3.6.1.4.1.25178.1.2.10']),
        personalUniqueCode: getFirstAttribute(attrs, ['schacPersonalUniqueCode', 'urn:oid:1.3.6.1.4.1.25178.1.2.14']),
        organizationName: getFirstAttribute(attrs, ['organizationName', 'o', 'urn:oid:2.5.4.10']),
        samlAssertion: samlResponse, // Preserve raw Base64 assertion for downstream intents
      };

      if (normalizedCountry) {
        userData.country = normalizedCountry;
      }

      resolve(userData);
    });
  });
}
