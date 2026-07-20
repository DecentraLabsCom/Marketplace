# Register as a provider

Provider onboarding uses institutional SSO, an institution-managed backend and a managed institutional wallet. Marketplace does not ask a provider to connect a personal wallet, select a network or pay browser-side gas.

## Before you start

You need:

- an institutional SSO account;
- either the institutional-admin entitlement or the current temporary `faculty`, `staff` or `employee` registration privilege; and
- an institutional backend reachable through a public HTTPS origin, with its managed wallet configured.

The temporary affiliation path is limited to institutional registration. It does not grant platform-administrator privileges.

## Onboard the institution

1. Sign in through **Institutional Login** and open `/register`.
2. Select **Provider**. Marketplace creates a short-lived pairing challenge from your verified SSO institution. It does not trust a browser-supplied wallet or backend URL.
3. Give the challenge to the institution administrator or backend operator through your approved internal channel.
4. The backend offers its canonical HTTPS origin and managed-wallet address to Marketplace, signing the pairing declaration with that wallet.
5. Marketplace shows the institution, wallet and exact origin as read-only values. Confirm only after checking that your institution controls them.
6. Marketplace issues a one-time provisioning token after approval. The backend retrieves it using the original challenge and completes the provider registration.
7. Once the provider role is available, open the **Lab Panel** to create or manage laboratories.

The registered origin is a root of trust for institutional calls and provider metadata. Registering `https://gateway.example.edu` does not trust a sibling such as `https://metadata.example.edu`.

## What happens next

Provider lab changes are authorized through the institution's backend and recorded on-chain. Provider settlement uses the institution's internal service-credit account; it is not `$LAB`, a browser ERC-20 payment or a cash-redeemable balance.

Follow [Configure and publish your lab](tokenize-and-list-your-lab.md) after onboarding. The pairing protocol and operational recovery are maintained in the private developer documentation for backend operators.
