# Register as a provider

Provider onboarding follows the current institutional model. The Marketplace does not use a personal MetaMask login or a provider's personal wallet as the customer-facing registration mechanism.

## Requirements

You need:

* an institutional SSO account;
* an institutional role authorized to provision or manage provider access; and
* an institutional backend with the public HTTPS origin and credentials required by the onboarding flow.

The institutional backend and its managed wallet are infrastructure controlled by the institution. They are not a per-provider wallet that each user must connect in the browser.

## Institutional onboarding flow

1. Sign in to the Marketplace using **Institutional Login**.
2. Open the `/register` page. Only an authorized institution staff member can provision institution-level access.
3. Select **Provider** and enter the institution's public HTTPS base URL. The country field is optional when it is not supplied by the institution's identity attributes.
4. Generate the short-lived provisioning token. The token is intended for the institution's provisioning or wallet dashboard and is not a permanent user credential.
5. Apply the token through the institutional backend. The backend performs the institution/provider registration, configures the managed institutional wallet and enables the roles and capabilities required by the Lab Panel.
6. After the institution is registered and the provider role is available, sign in again if necessary and open the **Lab Panel**.

For an institution already integrated with DecentraLabs, individual providers are assigned by the institution's administrator and reuse the institution's verified backend. A new provider therefore does not require adding another Marketplace allowlist entry or manually configuring a new blockchain endpoint.

## What the Marketplace records

The provider account is associated with the institution and its authorized role. On-chain lab mutations are submitted through the configured institutional backend and managed wallet. The Marketplace does not ask the provider to choose a network, pay gas, or submit a direct personal-wallet transaction.

Provider settlement uses internal service credits under the institution's configured account. These credits are not `$LAB`, ERC-20 payments, or cash-redeemable balances.

## If your institution is not integrated

Contact the institution administrator or DecentraLabs support. The first institution onboarding may require administrative verification of the backend origin, identity attributes and managed wallet. Once the institution is active, later providers from that institution use the existing registration.

The old wallet-based self-service form and DAO approval flow are historical material and are not the active Marketplace onboarding path.

<figure><img src="../.gitbook/assets/image (4).png" alt="Institutional provider onboarding"><figcaption></figcaption></figure>
