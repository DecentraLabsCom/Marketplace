import { parseSAMLResponse, createSession } from "@/utils/sso";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    // Step 1: Process the SAML response sent by the IdP
    const samlResponse = req.body.SAMLResponse;
    const userData = await parseSAMLResponse(samlResponse);

    if (!userData) {
      return res.status(400).json({ error: "Invalid SAML response" });
    }

    // Step 2: Create a session for the authenticated user
    await createSession(res, userData);

    // Step 3: Redirect the user to the dashboard
    res.redirect("/dashboard");
  } catch (error) {
    console.error("Error processing SAML response:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}