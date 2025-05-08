import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { parseStringPromise } from "xml2js";

export async function POST(request) {
  const body = await request.text();
  const samlLogoutRequest = body;

  try {
    const parsedXml = await parseStringPromise(samlLogoutRequest);
    // TODO: verify parsedXml to make sure the logout request is valid

    const cookieStore = await cookies();
    cookieStore.set("user_session", "", { maxAge: 0, path: "/" });

    return NextResponse.redirect("/");
  } catch (error) {
    console.error("Error while processing SAML logout:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}