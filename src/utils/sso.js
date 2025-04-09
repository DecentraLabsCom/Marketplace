import { ServiceProvider, IdentityProvider } from "saml2-js";
import { serialize } from "cookie";
import fs from "fs";
import path from "path";

async function createSession(res, userData) {
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

// To generate the certificate files:
// C:\Program Files\Git\usr\bin>openssl req -x509 -newkey rsa:2048 -keyout key.pem -out cert.pem -days 365 -nodes -subj "/CN=localhost"
const keyPath = path.join(process.cwd(), 'certificates', "key.pem");
const certPath = path.join(process.cwd(), 'certificates', "cert.pem");
const sp = new ServiceProvider({
  entity_id: process.env.NEXT_PUBLIC_SAML_SP_METADATA_URL,
  private_key: fs.readFileSync(keyPath, "utf8"),
  certificate: fs.readFileSync(certPath, "utf8"),
  assert_endpoint: NEXT_PUBLIC_SAML_SP_CALLBACK_URL,
});

const idPCertPath = path.join(process.cwd(), 'certificates', "idp_cert.pem");
const idp = new IdentityProvider({
  sso_login_url: process.env.NEXT_PUBLIC_SAML_IDP_LOGIN_URL,
  sso_logout_url: process.env.NEXT_PUBLIC_SAML_IDP_LOGOUT_URL,
  certificates: [process.env.SAML_IDP_CERTIFICATE.replace(/\\n/g, "\n")],
  //certificates: fs.readFileSync(idPCertPath, "utf8"),
});

async function parseSAMLResponse(samlResponse) {
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

export { createSession, sp, parseSAMLResponse };