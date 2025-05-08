import { ServiceProvider, IdentityProvider } from "saml2-js";
import { serialize } from "cookie";

export async function createSession(res, userData) {
  // Create a cookie with the user information
  const sessionCookie = serialize("user_session", JSON.stringify(userData), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 60 * 60 * 24, // 1 day
  });

  res.setHeader("Set-Cookie", sessionCookie);
}

export function createServiceProvider() {
  const privateKey = process.env.SAML_SP_PRIVATE_KEY?.replace(/\\n/g, "\n") ?? "";
  const certificate = process.env.SAML_SP_CERTIFICATE?.replace(/\\n/g, "\n") ?? "";
  // TODO: Use a separate pair of keys for encryption
  //const privateKeyEncryption = process.env.SAML_SP_PRIVATE_KEY_ENCRYPTION?.replace(/\\n/g, "\n") ?? "";
  //const certificateEncryption = process.env.SAML_SP_CERTIFICATE_ENCRYPTION?.replace(/\\n/g, "\n") ?? "";

  return new ServiceProvider({
    entity_id: process.env.NEXT_PUBLIC_SAML_SP_METADATA_URL,
    assert_endpoint: process.env.NEXT_PUBLIC_SAML_SP_CALLBACK_URL,
    logout_url: process.env.NEXT_PUBLIC_SAML_SP_LOGOUT_URL,
    private_key: privateKey,
    certificate: certificate,
    //encryption_private_key: privateKeyEncryption,
    //encryption_certificate: certificateEncryption,
  });
}

export function createIdentityProvider() {
  const idpCert = process.env.SAML_IDP_CERTIFICATE?.replace(/\\n/g, "\n") ?? "";

  return new IdentityProvider({
    sso_login_url: process.env.NEXT_PUBLIC_SAML_IDP_LOGIN_URL,
    sso_logout_url: process.env.NEXT_PUBLIC_SAML_IDP_LOGOUT_URL,
    certificates: [idpCert],
  });
}

export async function parseSAMLResponse(samlResponse) {
  const sp = createServiceProvider();
  const idp = createIdentityProvider();

  return new Promise((resolve, reject) => {
    sp.post_assert(idp, { request_body: { SAMLResponse: samlResponse } }, (err, samlAssertion) => {
      if (err) {
        return reject(err);
      }

      // Get user information from the assertion
      const userData = {
        id: samlAssertion.user.attributes.uid,
        email: samlAssertion.user.attributes.mail,
        name: samlAssertion.user.attributes.displayName,
        affiliation: samlAssertion.user.attributes.schacHomeOrganization,
        role: samlAssertion.user.attributes.eduPersonAffiliation,
        scopedRole: samlAssertion.user.attributes.eduPersonScopedAffiliation,
      };

      resolve(userData);
    });
  });
}