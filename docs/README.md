---
description: Public user guide for consumers, providers and laboratory users.
---

# Marketplace user guide

DecentraLabs Marketplace connects institutional users with remote laboratories
and FMU simulations. The public documentation is organized by the job a user
needs to complete, rather than by the internal services that implement it.

## Choose your role

### I want to use a laboratory

Start with [Access laboratories](access-laboratories.md). It covers sign-in,
catalogue discovery, reservations, cancellation and the access hand-off to the
provider gateway.

For the detailed reservation rules, see
[Reservations and cancellations](reservations-and-cancellations.md).

### I represent an institution that wants to consume laboratories

Read [Become a consumer](become-a-consumer.md), then continue with
[Credits and funding](consumer/credits-and-funding.md). A consumer institution
does not publish a lab or operate a provider gateway.

### I represent an institution that wants to publish a laboratory

Follow [Become a provider](become-a-provider.md), which links the setup steps
in their intended order. The provider pages then link to the Gateway and
Lab-Metadata documentation for the parts owned by those projects.

The provider path depends on a working Lab Gateway, institutional backend and,
where applicable, Lab Station. Marketplace does not replace those components.

## Current model

- Institutional SSO identifies the user and the user's institution.
- The institution's backend and managed wallet authorize institutional actions.
- Service credits authorize reservations but are not cash or a personal wallet
  balance.
- The provider's Gateway creates the remote session after reservation and
  institutional checks succeed.
- Public metadata describes a lab; it never grants access and must not contain
  credentials or session tokens.

## Support and operational notices

If an issue affects an institutional account, contact the institution
administrator or backend operator first. For provider infrastructure, contact
the provider's Gateway/operator team. For a Marketplace error, use the live
[Contact page](https://www.decentralabs-marketplace.app/contact) and include
the time, affected laboratory, visible error and correlation ID if one is shown.

The live product also publishes the [FAQ](https://www.decentralabs-marketplace.app/faq),
[privacy notice](https://www.decentralabs-marketplace.app/privacy),
[terms](https://www.decentralabs-marketplace.app/terms),
[cookies notice](https://www.decentralabs-marketplace.app/cookies) and
[security page](https://www.decentralabs-marketplace.app/security).

## Identity provider rollout

Production currently uses SAML. Microsoft Entra ID/OIDC is implemented on the
`feature/entra-id` branch and is the identity-provider path exercised by the
stable Preview while that branch is selected by `MARKETPLACE_PREVIEW_BRANCH`.
Do not register the Preview callback as a production callback until the branch
is promoted to `main`.

| Environment | SAML metadata | SAML ACS/callback | SAML logout | Entra callback | Status |
| --- | --- | --- | --- | --- | --- |
| Production (`main`) | `https://www.decentralabs-marketplace.app/api/auth/sso/saml2/metadata` | `https://www.decentralabs-marketplace.app/api/auth/sso/saml2/callback` | `https://www.decentralabs-marketplace.app/api/auth/sso/saml2/logout` | Pending OIDC promotion | SAML available |
| Stable Preview (default `feature/entra-id`) | `https://marketplace-decentralabs.vercel.app/api/auth/sso/saml2/metadata` | `https://marketplace-decentralabs.vercel.app/api/auth/sso/saml2/callback` | `https://marketplace-decentralabs.vercel.app/api/auth/sso/saml2/logout` | `https://marketplace-decentralabs.vercel.app/api/auth/entra/callback` | SAML + Entra |

For identity-provider registration, use the technical configuration supplied by
the institution or deployment operator. Callback origins are environment- and
branch-specific; do not copy a preview registration into production.

For implementation-specific work, consult the owning project:
[Lab-Metadata](https://github.com/DecentraLabsCom/Lab-Metadata),
[Lab Gateway](https://github.com/DecentraLabsCom/Lab-Gateway) or the canonical
[blockchain-services documentation](https://github.com/DecentraLabsCom/blockchain-services/blob/main/SUMMARY.md).

Last reviewed: 2026-10-06
