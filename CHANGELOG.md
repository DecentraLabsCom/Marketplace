# Changelog

This file records user-visible and operational changes to the Marketplace.
Versions follow Semantic Versioning. `package.json` is the source of the
application package version; `NEXT_PUBLIC_RELEASE_ID` is the deployment/cache
identifier and must change on every deployment that can alter public data or
browser behavior.

## Unreleased

### Documentation

- Added a canonical documentation index and audience map.
- Marked the historical wallet/`$LAB` PDF material as non-normative.
- Clarified `institutionId`, institutional SSO, managed wallets, exact metadata
  origins and non-cash service credits.
- Documented the release, deployment and legal-review responsibilities.

### Verification

- The current repository README documents the deterministic test suite, the
  protected live-integration workflow and the authenticated Lighthouse lane.

## 0.1.0

Initial tracked Marketplace package version. The current deployed behavior is
defined by the implementation and the canonical guides linked from
[`docs/README.md`](docs/README.md), not by older exported PDFs.
