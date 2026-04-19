import { NextResponse } from 'next/server'

/**
 * POST /api/simulations/upload
 *
 * Upload from Marketplace is intentionally disabled.
 * Providers must provision .fmu artifacts directly on Lab Station/Lab Gateway.
 */
export async function POST() {
  return NextResponse.json(
    {
      error: 'FMU upload from Marketplace is disabled. Provision the .fmu file directly on Lab Station and register it by accessKey.',
      code: 'FMU_UPLOAD_DISABLED',
    },
    { status: 410 },
  )
}