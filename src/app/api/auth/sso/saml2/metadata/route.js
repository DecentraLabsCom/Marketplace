/**
 * API endpoint for generating SAML2 service provider metadata
 * Handles GET requests to provide XML metadata for SSO configuration
 */
import { NextResponse } from 'next/server'
import { createServiceProvider } from '@/utils/auth/sso'

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

        // Inject AttributeConsumingService so IdPs in REFEDS/SIR federations release the
        // required attributes. saml2-js does not generate this block natively.
        const attributeConsumingService = `
    <md:AttributeConsumingService index="1">
      <md:ServiceName xml:lang="en">Decentralabs Marketplace</md:ServiceName>
      <!-- Required -->
      <md:RequestedAttribute FriendlyName="eduPersonPrincipalName" Name="urn:oid:1.3.6.1.4.1.5923.1.1.1.6" NameFormat="urn:oasis:names:tc:SAML:2.0:attrname-format:uri" isRequired="true"/>
      <md:RequestedAttribute FriendlyName="mail" Name="urn:oid:0.9.2342.19200300.100.1.3" NameFormat="urn:oasis:names:tc:SAML:2.0:attrname-format:uri" isRequired="true"/>
      <!-- Person name (displayName required, or givenName+sn together) -->
      <md:RequestedAttribute FriendlyName="displayName" Name="urn:oid:2.16.840.1.113730.3.1.241" NameFormat="urn:oasis:names:tc:SAML:2.0:attrname-format:uri" isRequired="true"/>
      <md:RequestedAttribute FriendlyName="cn" Name="urn:oid:2.5.4.3" NameFormat="urn:oasis:names:tc:SAML:2.0:attrname-format:uri" isRequired="false"/>
      <md:RequestedAttribute FriendlyName="givenName" Name="urn:oid:2.5.4.42" NameFormat="urn:oasis:names:tc:SAML:2.0:attrname-format:uri" isRequired="false"/>
      <md:RequestedAttribute FriendlyName="sn" Name="urn:oid:2.5.4.4" NameFormat="urn:oasis:names:tc:SAML:2.0:attrname-format:uri" isRequired="false"/>
      <!-- Affiliation -->
      <md:RequestedAttribute FriendlyName="eduPersonScopedAffiliation" Name="urn:oid:1.3.6.1.4.1.5923.1.1.1.9" NameFormat="urn:oasis:names:tc:SAML:2.0:attrname-format:uri" isRequired="false"/>
      <md:RequestedAttribute FriendlyName="eduPersonAffiliation" Name="urn:oid:1.3.6.1.4.1.5923.1.1.1.1" NameFormat="urn:oasis:names:tc:SAML:2.0:attrname-format:uri" isRequired="false"/>
      <md:RequestedAttribute FriendlyName="eduPersonTargetedID" Name="urn:oid:1.3.6.1.4.1.5923.1.1.1.10" NameFormat="urn:oasis:names:tc:SAML:2.0:attrname-format:uri" isRequired="false"/>
      <!-- Institution -->
      <md:RequestedAttribute FriendlyName="schacHomeOrganization" Name="urn:oid:1.3.6.1.4.1.25178.1.2.9" NameFormat="urn:oasis:names:tc:SAML:2.0:attrname-format:uri" isRequired="false"/>
      <md:RequestedAttribute FriendlyName="organizationName" Name="urn:oid:2.5.4.10" NameFormat="urn:oasis:names:tc:SAML:2.0:attrname-format:uri" isRequired="false"/>
      <!-- Country -->
      <md:RequestedAttribute FriendlyName="c" Name="urn:oid:2.5.4.6" NameFormat="urn:oasis:names:tc:SAML:2.0:attrname-format:uri" isRequired="false"/>
    </md:AttributeConsumingService>`;

        // Insert before the closing </md:SPSSODescriptor> tag
        const enrichedMetadata = metadata.replace(
            '</md:SPSSODescriptor>',
            `${attributeConsumingService}\n  </md:SPSSODescriptor>`
        );

        // Return XML metadata as response
        return new NextResponse(enrichedMetadata, {
            status: 200,
            headers: { "Content-Type": "application/xml" },
        });
    } catch (error) {
        console.error("Error generating SAML metadata:", error);
        return new NextResponse("Unexpected error generating metadata", { status: 500 });
    }
}
