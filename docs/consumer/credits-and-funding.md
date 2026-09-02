---
description: Understand institutional service credits, funding orders and account information.
---

# Credits and funding

Service credits are internal units used by an institution to authorize
laboratory reservations. They are not cash, a personal wallet balance or a
transferable `$LAB` payment. The institution's backend and its administrators
control how credits are funded and which users or activities may spend them.

## Who does what

| Responsibility | Usually handled by |
| --- | --- |
| Create and configure the institutional credit account | Institutional backend operator |
| Request or approve a top-up | Institution administrator and its finance/backend process |
| Apply spending limits and user policy | Institution and backend operator |
| Display balance and activity in Marketplace | Marketplace, using authenticated backend reads |
| Calculate and authorize a reservation | Institutional backend and the reservation contract |

Registering an institution as a consumer associates its SSO organization with
the institution's managed backend and wallet. It does not, by itself, create a
funding order or guarantee that the account has available credits.

## Prepare an institution for reservations

1. Complete [consumer registration](../become-a-consumer.md).
2. Ask the approved backend operator to create or confirm the institution's
   credit account.
3. Agree the funding method, approval process, spending limits and support
   contact with the institution. These are institutional policies, not browser
   wallet operations in Marketplace.
4. Ask the operator to create or process a funding order when additional
   credits are needed.
5. Sign in again and open the **Service Credit Account** panel from the user
   dashboard to confirm the account state before making a reservation.

Marketplace does not expose a self-service cash checkout. The exact funding
method, invoice process and approval timing belong to the institution and its
backend operator.

## Read the account panel

The panel can show:

- **Available**: credits currently available for a new authorized operation;
- **Locked**: credits reserved or held by an in-progress accounting flow;
- **Consumed**: credits already applied to institutional activity;
- **Expired**: credits that are no longer usable;
- **Expiring credit lots**: lots approaching their expiry date;
- **Pending top-up orders**: funding orders that still require institutional
  processing; and
- **Recent activity**: credit issuance, locks, returns and expiry movements.

The panel highlights lots expiring within the next 30 days. A returned credit
may still be affected by the expiry of the source lot; the reservation
cancellation preview is authoritative for the operation being confirmed.

## If the balance is missing or too low

- If no credit account exists, contact the institution's backend operator.
- If the credit service is temporarily unavailable, retry later and do not
  assume that a stale display is an authorization guarantee.
- If there is no pending top-up order, contact the institution administrator to
  request service-credit funding.
- If a reservation costs more than the available amount, ask the institution
  administrator about its funding or spending policy; do not connect a personal
  wallet to resolve the issue.

The backend and contract re-check the balance, limits and reservation price
when the reservation is authorized. The value shown in the browser is an
estimate and account view, not a promise that a later reservation will be
accepted.

Last reviewed: 2026-09-02
