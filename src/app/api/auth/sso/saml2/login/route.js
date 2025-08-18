/**
 * API endpoint for initiating SAML2 SSO login process
 * Handles GET requests to redirect users to SSO identity provider
 */
import { NextResponse } from 'next/server'
import { createServiceProvider, createIdentityProvider } from '@/utils/auth/sso'

/**
 * Initiates SAML2 SSO login by redirecting to identity provider
 * @returns {Response} Redirect response to SSO login URL or error
 */
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
