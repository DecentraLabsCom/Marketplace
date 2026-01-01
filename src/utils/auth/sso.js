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
      const country = getFirstAttribute(attrs, [
        'c',
        'co',
        'country',
        'countryCode',
        'countryName',
        'urn:oid:2.5.4.6',
        'schacCountryOfResidence',
        'schacCountryOfCitizenship',
      ]);
      const normalizedCountry = normalizeCountryCode(country);

      // Get user information from the assertion
      const userData = {
        id: Array.isArray(attrs.uid) ? attrs.uid[0] : attrs.uid,
        email: Array.isArray(attrs.mail) ? attrs.mail[0] : attrs.mail,
        name: Array.isArray(attrs.displayName) ? attrs.displayName[0] : attrs.displayName,
        affiliation: Array.isArray(attrs.schacHomeOrganization) ? 
                      attrs.schacHomeOrganization[0] : attrs.schacHomeOrganization,
        role: Array.isArray(attrs.eduPersonAffiliation) ? 
              attrs.eduPersonAffiliation[0] : attrs.eduPersonAffiliation,
        scopedRole: Array.isArray(attrs.eduPersonScopedAffiliation) ? 
                    attrs.eduPersonScopedAffiliation[0] : attrs.eduPersonScopedAffiliation,
        organizationType: Array.isArray(attrs.schacHomeOrganizationType) ? 
                         attrs.schacHomeOrganizationType[0] : attrs.schacHomeOrganizationType,
        personalUniqueCode: Array.isArray(attrs.schacPersonalUniqueCode) ? 
                                attrs.schacPersonalUniqueCode[0] : attrs.schacPersonalUniqueCode, 
        organizationName: attrs.organizationName ? 
                         (Array.isArray(attrs.organizationName) ? attrs.organizationName[0] : attrs.organizationName) 
                         : null, // Optional - not all IdPs provide this
        samlAssertion: samlResponse, // Preserve raw Base64 assertion for downstream intents
      };

      if (normalizedCountry) {
        userData.country = normalizedCountry;
      }

      resolve(userData);
    });
  });
}
