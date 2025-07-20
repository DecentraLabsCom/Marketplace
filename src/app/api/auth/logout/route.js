import { NextResponse } from "next/server";
import { cookies } from "next/headers";

export async function GET() {
    const cookieStore = await cookies();
    cookieStore.set("user_session", "", { maxAge: 0, path: "/" });
    return NextResponse.json({ });
}
