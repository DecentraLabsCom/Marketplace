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
  
  const sp = new ServiceProvider({
    entity_id: process.env.NEXT_PUBLIC_SAML_SP_METADATA_URL,
    assert_endpoint: process.env.NEXT_PUBLIC_SAML_SP_CALLBACK_URL,
    private_key: privateKey,
    certificate: certificate,
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
  console.log("IDP Metadata:", metadata);

  return new IdentityProvider({
    metadata,
  });
}

export async function parseSAMLResponse(samlResponse) {
  const sp = createServiceProvider();
  const idp = await createIdentityProvider();

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