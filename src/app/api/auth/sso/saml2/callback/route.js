/**
 * API endpoint for handling SAML2 SSO callback from identity provider
 * Processes SAML response and creates user session
 */
import { NextResponse } from 'next/server'
import { parseSAMLResponse, createSession } from '@/utils/auth/sso'

/**
 * Processes SAML2 callback response and creates user session
 * @param {Request} request - HTTP POST request with SAML response
 * @param {string} request.body.SAMLResponse - Base64 encoded SAML response
 * @returns {Response} JSON response with session result or error
 */
export async function POST(request) {
  try {
    // Step 1: Process the SAML response sent by the IdP
    const text = await request.text();
    const params = new URLSearchParams(text);
    const samlResponse = params.get("SAMLResponse");
    const userData = await parseSAMLResponse(samlResponse);

    if (!userData) {
      return NextResponse.json({ error: "Invalid SAML response" }, { status: 400 });
    }

    // Step 2: Create a session for the authenticated user and redirect to dashboard
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || request.nextUrl.origin;
    const response = NextResponse.redirect(`${baseUrl}/userdashboard?sso_login=1`, 303);
    await createSession(response, userData);
    return response;
  } catch (error) {
    console.error("Error processing SAML response:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
