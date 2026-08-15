# Changelog

This file records user-visible and operational changes to the Marketplace.
Versions follow Semantic Versioning. `package.json` is the source of the
application package version; `NEXT_PUBLIC_RELEASE_ID` is the deployment/cache
identifier and must change on every deployment that can alter public data or
browser behavior.

## Unreleased

### Catalogue

- Suppressed routine refresh notices and limited stale-data warnings to
  prolonged catalogue degradation; repeated warnings are hidden for the same
  snapshot during a browser session.
- Added server-side diagnostics for catalogue snapshot revalidation failures.
- Retried transient laboratory metadata failures and stopped degraded snapshot
  data from replacing the last complete catalogue presentation.

### Simulation

- Added configurable simulation result visualizations: time series, arbitrary
  2D plots, projected 3D trajectories and state-space projections, with
  selectable vector components, axes, colour variable and point tooltips.

### Reservations

- Kept confirmed cancellation enabled when the on-chain preview is cancellable
  but its source-credit expiry has passed; Marketplace now presents that expiry
  as an advisory about the returned credits instead of a second authorization
  rule.

### Authentication

- Extended the default Marketplace SSO session lifetime from 30 to 60 minutes.
- Made the Marketplace SSO session sliding: authenticated requests renew it only during the final 15 minutes of its TTL, while status-only polling does not keep an idle session alive.
- Renewed the SAML NameID/SessionIndex binding together with a sliding session so IdP-initiated logout can still find the active Marketplace session.
- Made browser FMU requests fail closed when the Marketplace session store is unavailable, while retaining independent capabilities when no session cookie exists.

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
