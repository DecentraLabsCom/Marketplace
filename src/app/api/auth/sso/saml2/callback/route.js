import { parseSAMLResponse, createSession } from "@/utils/sso";
import { NextResponse } from "next/server";

export async function POST(request) {
  try {
    // Step 1: Process the SAML response sent by the IdP
    const body = await request.json();
    const samlResponse = body.SAMLResponse;
    const userData = await parseSAMLResponse(samlResponse);

    if (!userData) {
      return NextResponse.status(400).json({ error: "Invalid SAML response" });
    }

    // Step 2: Create a session for the authenticated user and redirect to dashboard
    const response = NextResponse.redirect("/userdashboard");
    await createSession(response, userData);
    res.redirect("/userdashboard");
  } catch (error) {
    console.error("Error processing SAML response:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}