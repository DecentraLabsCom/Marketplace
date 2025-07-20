import { createServiceProvider, createIdentityProvider } from "@/utils/sso";
import { NextResponse } from "next/server";

export async function GET() {
  const sp = createServiceProvider();
  const idp = await createIdentityProvider();

  return new Promise((resolve) => {
    sp.create_login_request_url(idp, {}, (err, loginUrl) => {
      if (err) {
        resolve(new NextResponse("Failed to create SSO login URL", { status: 500 }));
      } else {
        resolve(NextResponse.redirect(loginUrl));
      }
    });
  });
}
