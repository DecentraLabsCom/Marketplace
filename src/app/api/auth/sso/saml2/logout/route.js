import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { parseStringPromise } from "xml2js";
import devLog from '@/utils/dev/logger';

// Validate SAML logout request structure
function isValidSamlLogoutRequest(parsedXml) {
  try {
    // Check for SAML logout request structure
    const logoutRequest = parsedXml?.['samlp:LogoutRequest'] || parsedXml?.LogoutRequest;
    
    if (!logoutRequest) {
      return false;
    }

    // Validate required attributes
    const attributes = logoutRequest.$;
    if (!attributes) {
      return false;
    }

    // Check for required fields
    const requiredFields = ['ID', 'Version', 'IssueInstant'];
    for (const field of requiredFields) {
      if (!attributes[field]) {
        devLog.error(`Missing required field: ${field}`);
        return false;
      }
    }

    // Validate SAML version (should be 2.0)
    if (attributes.Version !== '2.0') {
      devLog.error(`Invalid SAML version: ${attributes.Version}`);
      return false;
    }

    // Validate timestamp (should be recent, within 5 minutes)
    const issueInstant = new Date(attributes.IssueInstant);
    const now = new Date();
    const timeDiff = Math.abs(now - issueInstant) / 1000; // in seconds
    
    if (timeDiff > 300) { // 5 minutes
      devLog.error(`Logout request too old: ${timeDiff} seconds`);
      return false;
    }

    // Check for Issuer element
    const issuer = logoutRequest['saml:Issuer'] || logoutRequest.Issuer;
    if (!issuer || !issuer[0]) {
      devLog.error("Missing Issuer element");
      return false;
    }

    return true;
  } catch (error) {
    devLog.error("Error validating SAML logout request:", error);
    return false;
  }
}

export async function POST(request) {
  const body = await request.text();
  const samlLogoutRequest = body;

  try {
    const parsedXml = await parseStringPromise(samlLogoutRequest);
    
    // Validate SAML logout request structure and content
    if (!isValidSamlLogoutRequest(parsedXml)) {
      devLog.error("Invalid SAML logout request structure");
      return NextResponse.json({ error: "Invalid logout request" }, { status: 400 });
    }

    const cookieStore = await cookies();
    cookieStore.set("user_session", "", { maxAge: 0, path: "/" });

    return NextResponse.redirect("/");
  } catch (error) {
    devLog.error("Error while processing SAML logout:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
