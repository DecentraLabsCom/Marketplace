/**
 * API endpoint for generating SAML2 service provider metadata
 * Handles GET requests to provide XML metadata for SSO configuration
 */
import { NextResponse } from 'next/server'
import { createServiceProvider } from '@/utils/auth/sso'
import devLog from '@/utils/dev/logger'

/**
 * Generates and returns SAML2 metadata XML for service provider configuration
 * @returns {Response} XML response with SAML metadata or error response
 */
export async function GET() {
    const sp = createServiceProvider();
    try {
        // Generate XML metadata
        if (typeof sp.create_metadata !== "function") {
            return new NextResponse("sp.create_metadata is not a function", { status: 500 });
        }

        const metadata = sp.create_metadata();

        if (!metadata || typeof metadata !== "string") {
            return new NextResponse("Generated metadata is empty or invalid", { status: 500 });
        }

        // Return XML metadata as response
        return new NextResponse(metadata, {
            status: 200,
            headers: { "Content-Type": "application/xml" },
        });
    } catch (error) {
        devLog.error("Error generating SAML metadata:", error);
        return new NextResponse("Unexpected error generating metadata", { status: 500 });
    }
}
