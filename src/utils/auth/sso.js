import { ServiceProvider, IdentityProvider } from 'saml2-js'
import xml2js from 'xml2js'
import devLog from '@/utils/dev/logger'

export async function createSession(response, userData) {
  // Create a cookie with the user information
  response.cookies.set("user_session", JSON.stringify(userData), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 60 * 60 * 24, // 1 day
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

  return new Promise((resolve, reject) => {
    sp.post_assert(idp, { request_body: { SAMLResponse: samlResponse } }, (err, samlAssertion) => {
      if (err) {
        devLog.error("SAML Assertion Error:", err);
        return reject(err);
      }

      const attrs = samlAssertion?.user?.attributes || {};

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
        // New SAML2 attributes
        organizationType: Array.isArray(attrs.schacHomeOrganizationType) ? 
                         attrs.schacHomeOrganizationType[0] : attrs.schacHomeOrganizationType,
        organizationName: attrs.organizationName ? 
                         (Array.isArray(attrs.organizationName) ? attrs.organizationName[0] : attrs.organizationName) 
                         : null, // Optional - not all IdPs provide this
      };

      resolve(userData);
    });
  });
}