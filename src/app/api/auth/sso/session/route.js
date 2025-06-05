import { NextResponse } from "next/server";
import { cookies } from "next/headers";

export async function GET() {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get("user_session")?.value;

  if (!sessionCookie) {
    return NextResponse.json({ user: null });
  }

  const user = JSON.parse(sessionCookie);
  return NextResponse.json({ user });
}