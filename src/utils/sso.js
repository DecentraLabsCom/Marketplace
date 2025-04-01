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

export const sp = new ServiceProvider({
  entity_id: "https://your-app.com/api/auth/sso/metadata",
  private_key: process.env.SAML_PRIVATE_KEY,
  certificate: process.env.SAML_CERTIFICATE,
  assert_endpoint: "https://your-app.com/api/auth/sso/callback",
});

const idp = new IdentityProvider({
  sso_login_url: process.env.NEXT_PUBLIC_SAML_IDP_LOGIN_URL,
  sso_logout_url: process.env.NEXT_PUBLIC_SAML_IDP_LOGOUT_URL,
  certificates: [process.env.SAML_IDP_CERTIFICATE],
});

export async function parseSAMLResponse(samlResponse) {
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