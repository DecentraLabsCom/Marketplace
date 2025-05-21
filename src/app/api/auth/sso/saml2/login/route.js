import { createServiceProvider, createIdentityProvider } from "../../../../../../utils/sso";
import { NextResponse } from "next/server";

export async function GET() {
  const sp = createServiceProvider();
  const idp = await createIdentityProvider();
  console.log("SP:", sp);
  console.log("IdP:", idp);

  return new Promise((resolve, reject) => {
    sp.create_login_request_url(idp, {}, (err, loginUrl) => {
      if (err) {
        console.error("SSO login error:", err);
        resolve(new NextResponse("Failed to create SSO login URL", { status: 500 }));
      } else {
        resolve(NextResponse.redirect(loginUrl));
      }
    });
  });
}