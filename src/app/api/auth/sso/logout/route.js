import { NextResponse } from "next/server";
import { cookies } from "next/headers";

export async function GET() {
    cookies().set("user_session", "", { maxAge: 0, path: "/" });
    return NextResponse.json({ });
}