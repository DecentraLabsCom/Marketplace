import { NextResponse } from 'next/server';
import { requireAuth } from '@/utils/auth/guards';
import { isPlatformAdminSession, resolveSessionEmail } from '@/utils/auth/platformAdmin';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const session = await requireAuth();

    return NextResponse.json({
      isPlatformAdmin: isPlatformAdminSession(session),
      email: resolveSessionEmail(session) || null,
    });
  } catch {
    return NextResponse.json({
      isPlatformAdmin: false,
      email: null,
    });
  }
}
