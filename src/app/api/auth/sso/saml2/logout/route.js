import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { parseStringPromise } from "xml2js";

export async function POST(request) {
  const body = await request.text();
  const samlLogoutRequest = body;

  try {
    const parsedXml = await parseStringPromise(samlLogoutRequest);
    // Aquí puedes verificar el contenido de parsedXml para asegurarte de que la solicitud de logout es válida

    const cookieStore = await cookies();
    cookieStore.set("user_session", "", { maxAge: 0, path: "/" });

    return NextResponse.redirect("/");
  } catch (error) {
    console.error("Error while processing SAML logout:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}