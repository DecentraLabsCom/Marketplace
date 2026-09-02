---
description: Reservation timing, states, access windows and cancellation rules for laboratory users.
---

# Reservations and cancellations

This page explains the rules behind the reservation controls. For the complete
user journey, start with [Access laboratories](access-laboratories.md).

## Before reserving

- An external-provider reservation must start at least **10 minutes from now**.
- The available start times and durations are defined by the laboratory.
- The calendar presents both your local time and the laboratory's declared
  IANA time zone. Check the displayed laboratory time before confirming.
- A concurrent FMU may show occupancy such as `2/10`; a physical laboratory is
  normally exclusive unless its provider states otherwise.
- The review screen shows the unit price, estimated cost, cancellation policy
  and any lab-specific terms before submission.

The final price and reservation window are recalculated by the institutional
backend and contract. Do not treat a cached catalogue value as final
authorization.

## Reservation lifecycle

| User-visible state | Meaning |
| --- | --- |
| **Pending** | The request exists but provider confirmation is still outstanding. For an external lab, credits are not captured until confirmation. |
| **Confirmed** | The provider has confirmed the reservation and the access window is booked. |
| **Access Authorized** | The reservation is in the access-authorized phase. It is not a normal consumer-cancellation state. |
| **Completed** | The access window has ended. |
| **Collected** | The reservation has reached the provider/settlement completion state. |
| **Cancelled** | The reservation was cancelled through an authorized flow. |
| **Expired** | A pending or confirmed reservation has passed its usable window or decision deadline. |

For an external laboratory, a pending request has a short provider decision
window. If the provider does not confirm in time, the request expires without
capturing credits. A laboratory owned by the same institution may use an
atomic request-and-confirm flow.

## Cancelling a reservation

Open the reservation in the **User Dashboard** and choose **Cancel** when the
action is available.

- A **pending** request and a **confirmed** reservation use different
  cancellation operations.
- A pending request has not consumed credits and has no cancellation fee.
- For a confirmed reservation, Marketplace displays the current on-chain
  cancellation preview, including the amount to return, applicable fee and
  cancellation cutoff. The on-chain preview is authoritative and may vary by
  deployment or policy.
- The returned value goes to the institution's credit account, not to a
  personal wallet and not as a cash refund.
- If the source credit lot has expired, Marketplace warns that some or all of
  the returned value may be unavailable. This warning does not override an
  on-chain preview that explicitly allows cancellation.
- Completed, expired, already cancelled and access-authorized reservations
  cannot be cancelled by the consumer.

When a confirmed cancellation is unavailable, refresh the reservation details.
If the issue remains, contact the institution administrator or the support
contact for the laboratory. Do not submit the same cancellation repeatedly
while an earlier request is processing.

## Access window

Access is available only during the valid reservation window. Select **Access**
from the dashboard or laboratory page when the window is open. Marketplace
checks the institutional session and reservation, then the provider Gateway
creates the short-lived remote session. A user may reconnect while the window
remains active if the provider configuration permits it.

If a provider reports a service failure after access authorization, the provider
must use the Gateway's **Actionable Reservations** workflow. The consumer does
not cancel that state from Marketplace.

Last reviewed: 2026-09-02
