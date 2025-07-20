import { parseSAMLResponse, createSession } from "@/utils/sso";
import { NextResponse } from "next/server";
import devLog from '@/utils/logger';

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
    const response = NextResponse.redirect(`${baseUrl}/userdashboard`, 303);
    await createSession(response, userData);
    return response;
  } catch (error) {
    devLog.error("Error processing SAML response:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
