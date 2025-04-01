import { sp } from "@/utils/sso";

export default async function handler(req, res) {
    try {
        // Generate XML metadata
        const metadata = `
        <EntityDescriptor entityID="https://your-app.com/api/auth/sso/metadata">
            <SPSSODescriptor>
                <AssertionConsumerService
                    Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST"
                    Location="https://your-app.com/api/auth/sso/callback"
                    index="0" />
                <KeyDescriptor use="signing">
                    <KeyInfo>
                        <X509Data>
                            <X509Certificate>MIIC... (tu certificado público)</X509Certificate>
                        </X509Data>
                    </KeyInfo>
                </KeyDescriptor>
            </SPSSODescriptor>
        </EntityDescriptor>
        `;

        console.log("Service Provider: ", sp);
        /*const metadata = await new Promise((resolve, reject) => {
            sp.create_metadata((err, metadata) => {
                if (err) {
                    return reject(err);
                }
                resolve(metadata);
            });
        });*/

        // Return XML metadata as response
        res.setHeader("Content-Type", "application/xml");
        res.send(metadata);
    } catch (error) {
        res.status(500).send("Unexpected error generating metadata");
    }
}