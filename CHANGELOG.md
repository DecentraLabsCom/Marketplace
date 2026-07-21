# Changelog

This file records user-visible and operational changes to the Marketplace.
Versions follow Semantic Versioning. `package.json` is the source of the
application package version; `NEXT_PUBLIC_RELEASE_ID` is the deployment/cache
identifier and must change on every deployment that can alter public data or
browser behavior.

## Unreleased

### Authentication

- Extended the default Marketplace SSO session lifetime from 30 to 60 minutes.

### Documentation

- Reorganized Marketplace documentation by audience and operational concern.
- Added current architecture, operations, institutional-intent, provisioning,
  credits, metadata, security, testing and CI references.
- Added Mermaid diagrams for the runtime, intent, access, provisioning and
  metadata flows.
- Corrected the active intent contract to the single prepare route and the
  backend-owned WebAuthn ceremony; removed obsolete finalize-route guidance.
- Updated provider, access, cancellation and credential-handling guidance.

### Verification

- The current repository README documents the deterministic test suite, the
  protected live-integration workflow and the authenticated Lighthouse lane.

## 0.1.0

Initial tracked Marketplace package version. The current deployed behavior is
defined by the implementation and the canonical guides linked from
the current [public documentation guide](docs/README.md), not by older exported PDFs.
