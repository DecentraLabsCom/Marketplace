import { NextResponse } from "next/server";

export async function GET(request) {
  const cookies = request.cookies;
  const sessionCookie = cookies.get("user_session")?.value;

  if (!sessionCookie) {
    return NextResponse.json({ user: null });
  }

  const user = JSON.parse(sessionCookie);
  return NextResponse.json({ user });
}