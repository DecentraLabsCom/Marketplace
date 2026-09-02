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

Follow [Become a provider](become-a-provider.md) in this order:

1. [Lab requirements](become-a-provider/lab-requirements.md).
2. [Enable online access](become-a-provider/enable-your-lab-for-online-access.md).
3. [Register as a provider](become-a-provider/register-as-a-provider.md).
4. [Prepare Marketplace metadata](provider/metadata-integration.md).
5. [Configure and publish the lab](become-a-provider/tokenize-and-list-your-lab.md).
6. [Operate the published laboratory](provider/operate-your-lab.md).

The provider path depends on a working Lab Gateway, institutional backend and,
where applicable, Lab Station. Marketplace does not replace those components.

## Current model in one minute

- Institutional SSO identifies the user and the user's institution.
- The institution's backend and managed wallet authorize institutional actions.
- Service credits are internal accounting units. They are not cash, a personal
  wallet balance or a browser-side `$LAB` payment.
- The provider's Gateway is responsible for the remote session after the
  reservation and institutional checks succeed.
- Public metadata describes the lab; it never grants access and must not contain
  credentials or session tokens.

## Support and operational notices

If an issue affects an institutional account, contact the institution
administrator or backend operator first. For provider infrastructure, contact
the provider's Gateway/operator team. For a Marketplace error, use the live
[Contact page](https://marketplace-decentralabs.vercel.app/contact) and include
the time, affected laboratory, visible error and correlation ID if one is shown.

The live product also publishes the [FAQ](https://marketplace-decentralabs.vercel.app/faq),
[privacy notice](https://marketplace-decentralabs.vercel.app/privacy),
[terms](https://marketplace-decentralabs.vercel.app/terms),
[cookies notice](https://marketplace-decentralabs.vercel.app/cookies) and
[security page](https://marketplace-decentralabs.vercel.app/security).

For implementation-specific work, consult the documentation of the owning
project: [Lab-Metadata](https://github.com/DecentraLabsCom/Lab-Metadata),
[Lab Gateway](https://github.com/DecentraLabsCom/Lab-Gateway) or the canonical
[blockchain-services documentation](https://github.com/DecentraLabsCom/blockchain-services/blob/main/SUMMARY.md).

Last reviewed: 2026-09-02
