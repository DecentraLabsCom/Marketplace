# Configure and publish your lab

Once the institution has been onboarded and the provider role is available, open the **Lab Panel** and select **Add New Lab**. The normal provider flow uses institutional SSO and the institution's managed backend. It does not require a personal Web3 wallet, a network selection, a browser gas payment or a direct Marketplace transaction.

<figure><img src="../.gitbook/assets/image (1) (1).png" alt="Lab Panel"><figcaption></figcaption></figure>

The form offers **Full Setup** and **Quick Setup**. Both flows send authorized changes through the institution's configured backend; the backend performs the on-chain operation with the managed institutional wallet.

## Full Setup

Full Setup is the guided option for entering the laboratory information in the Marketplace.

1. Sign in with institutional SSO and open the **Lab Panel**.
2. Select **Add New Lab** and choose **Full Setup**.
3. Complete the basic information, category, description, availability and access requirements.
4. Set the price and its unit. Supported display units are `minute`, `hour`, `day`, `week` and `month`. The contract stores the normalized per-second value, while the catalogue and detail page show the configured unit.
5. Add images and documentation. Do not put gateway credentials, access keys or private provider contact data in public metadata.
6. Review the form and submit it. Wait for the institutional backend and on-chain confirmation before treating the lab as published.

The Marketplace creates the local metadata document as part of the provider workflow. In development, `Lab-*.json` files are stored under `data/`; in production, local metadata may be written to Vercel Blob. This is application-managed storage, not an automatic IPFS or Arweave publication.

## Quick Setup

Quick Setup is for providers that already maintain a metadata document at an external origin.

1. Prepare a JSON document using the laboratory metadata schema.
2. Host it at an HTTPS URL. Its exact origin must equal a provider backend origin registered on-chain, or be a reviewed global metadata exception managed by a platform administrator. Registering `gateway.example.edu` does not automatically trust `metadata.example.edu`. A decentralized store can be used behind an accepted HTTPS gateway, but an `ipfs://` URI is not itself an automatic trust decision.
3. Sign in with institutional SSO, open **Add New Lab** and choose **Quick Setup**.
4. Enter the price, display unit and metadata URL, then review the listing state.
5. Submit the authorized operation and wait for backend/on-chain confirmation.

The metadata URL is public catalogue input. Keep access URLs, access keys, service credentials and institutional contact details outside the public document.

<figure><img src="../.gitbook/assets/image (3).png" alt="Quick Setup"><figcaption></figcaption></figure>

## Listing and unlisted labs

Creating a lab and publishing it are separate states. The default public catalogue contains listed labs only. An explicit `includeUnlisted=true` request can expose an unlisted lab for discovery or administration, but an unlisted lab is not eligible for public booking. If the Marketplace cannot read the on-chain listing status, it does not treat the lab as listed.

## FMU and gateway files

Marketplace upload of `.fmu` files is disabled. For simulation labs, provision the FMU on the provider's **Lab Gateway/Lab Station** and register the corresponding file through the gateway configuration using its `accessKey`. The Marketplace stores and displays the descriptive metadata; it is not the authoritative FMU artifact store.

## Post-publication management

* Metadata-only changes update the application-managed document and do not necessarily require changing the on-chain lab record.
* Changes to on-chain fields, price, availability or the metadata URI are submitted again through the institutional backend and may wait for confirmation.
* If an external metadata document changes, ensure its URL remains reachable and its origin remains trusted. For immutable content-addressed storage, publish a new document and update the metadata URI through the provider flow.
* Keep the Lab Gateway, Lab Station and institutional backend operational. A visible listing does not by itself prove that the remote lab endpoint is available.
