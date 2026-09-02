---
description: Ongoing provider responsibilities after a laboratory is published.
---

# Operate your laboratory

Publication makes a laboratory visible in the catalogue; it does not prove
that the remote endpoint is healthy. Providers remain responsible for the
Gateway, institutional backend, Lab Station where used, metadata and
availability they publish.

## Before accepting reservations

- Verify the Gateway health and access path using the
  [Gateway operations and health guide](https://github.com/DecentraLabsCom/Lab-Gateway/blob/main/docs/reference/operations-and-health.md).
- Confirm that the provider backend can authorize the institution and resolve
  the registered laboratory.
- Run a complete test session using the
  [first lab session tutorial](https://github.com/DecentraLabsCom/Lab-Gateway/blob/main/docs/tutorials/tutorial-first-lab-session.md).
- Keep the published availability, time zone, durations and concurrency in
  sync with the real equipment or FMU service.
- Keep metadata URLs, images and documentation reachable. See
  [Marketplace metadata integration](metadata-integration.md) for the trust
  boundary.

## During normal operation

Monitor the provider dashboard and backend for reservations and authorization
requests. A provider must confirm pending requests according to its own
availability policy; a pending request is not yet a confirmed booking.

For a physical laboratory, ensure that the station and control application are
ready before the reservation begins. For an FMU, ensure that the configured
filename and access key resolve to the FMU provisioned in the Gateway/Station
environment. Never put that key or a Gateway credential in public metadata.

When a reservation reaches its access window, the Gateway controls the remote
session. If a provider service failure must be recorded after access has been
authorized, use the Gateway's **Actionable Reservations** workflow. The
consumer should not be asked to cancel that reservation from Marketplace.

## Updating or stopping a laboratory

| Operation | Effect |
| --- | --- |
| Metadata-only update | Changes the catalogue document; it may not require an on-chain mutation. |
| Price, access, availability or metadata URI update | Requires a new authorized provider operation and confirmation. |
| **Unlist** | Stops new public reservation intake while keeping the lab owned and editable. Existing obligations remain. |
| **Delete** | Unlists and burns the on-chain lab token. It is irreversible on-chain and does not erase historical settlement records. |

Use **Unlist** for maintenance or a temporary pause. Use **Delete** only when
the institution intentionally wants the on-chain laboratory record removed.
Gateway content and application-managed metadata have separate cleanup and
retention behavior; deleting a token does not mean that every external copy is
immediately erased.

## Credits and settlement

Provider settlement uses the institution's internal service-credit accounting.
Marketplace is not a cash-payout or personal-wallet service and does not
provide a provider payout mutation in the browser. Agree settlement reporting,
accounting ownership, timing and support with the institution's backend and
platform operator.

Last reviewed: 2026-09-02
