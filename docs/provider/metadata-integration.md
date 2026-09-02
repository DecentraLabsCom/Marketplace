---
description: Marketplace-specific integration rules for laboratory metadata and provider publication.
---

# Marketplace metadata integration

The normative metadata contract lives in the separate
[Lab-Metadata repository](https://github.com/DecentraLabsCom/Lab-Metadata). It
contains the field catalogue, validation rules and complete examples. This
page intentionally does not copy that schema; it explains how Marketplace
loads, trusts and publishes those documents.

Read these documents before preparing a Quick Setup document:

- [Lab-Metadata overview](https://github.com/DecentraLabsCom/Lab-Metadata/blob/main/README.md);
- [normative metadata schema](https://github.com/DecentraLabsCom/Lab-Metadata/blob/main/docs/metadata-schema.md); and
- [provider examples](https://github.com/DecentraLabsCom/Lab-Metadata/blob/main/docs/examples.md).

## Choose a Marketplace setup mode

### Full Setup

Use Full Setup when Marketplace should create and maintain the application-
managed metadata document while you complete the guided lab form. The form
still requires accurate operational information: access endpoint, price and
unit, opening and closing dates, availability, time zone, booking options,
keywords and concurrency. The form validates the values before sending an
authorized provider operation.

Images and PDF documentation may be uploaded or referenced according to the
form. Marketplace-managed metadata is stored locally during development and
may use Vercel Blob in production. It is application-managed storage, not an
automatic IPFS or Arweave publication.

### Quick Setup

Use Quick Setup when the provider already hosts the metadata JSON. The document
must be reachable at an HTTPS URL and its origin must be exactly the registered
provider backend origin, including scheme, host and port. A reviewed global
metadata exception is the only alternative. A sibling origin or an
`ipfs://` URI is not trusted automatically.

Quick Setup asks for the metadata URL, price, display unit and access details.
For a physical laboratory, the access key is a provider-side lookup identifier;
for an FMU, the registered filename is used as the resource identifier. Neither
is a password and neither belongs in public metadata.

## Publication checklist

Before submitting the provider operation:

1. Validate the JSON with the schema and choose the appropriate example from
   [Lab-Metadata](https://github.com/DecentraLabsCom/Lab-Metadata).
2. Confirm that the URL is public to Marketplace and remains stable.
3. Confirm that the URL's exact origin matches the institution's registered
   backend origin.
4. Check that the displayed price/unit, availability, time zone and booking
   policy match the Gateway's real operating policy.
5. Include user-facing descriptions, documentation and images where useful.
6. Remove passwords, JWTs, private keys, session tickets, gateway credentials,
   personal contact data and URLs that bypass reservation control.
7. After publication, open the catalogue and the laboratory details page as a
   user and verify the rendered metadata.

Changing the external JSON does not change on-chain price, access endpoint or
listing state. If the metadata URI or another on-chain field changes, submit
the corresponding authorized provider operation from the Lab Panel.

## FMU-specific boundary

Marketplace does not upload or execute provider FMU artifacts. Provision the
`.fmu` file in the provider's Lab Gateway/Lab Station infrastructure and use
the metadata only for discovery information such as the filename, FMI version,
simulation type and model variables. See the
[Lab Gateway FMI/FMU guide](https://github.com/DecentraLabsCom/Lab-Gateway/blob/main/docs/fmi-fmu-support.md)
for the execution-side setup.

Last reviewed: 2026-09-02
