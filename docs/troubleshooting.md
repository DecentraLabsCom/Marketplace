---
description: Troubleshoot common Marketplace login, onboarding, booking, metadata and access problems.
---

# Troubleshooting

Use the route below that matches the visible failure. Include the laboratory,
institution, approximate time and any correlation ID when contacting support.

| Symptom | First check | Escalate to |
| --- | --- | --- |
| Institutional Login is unavailable | Confirm that the institution provides the configured SSO access. | Institution identity administrator |
| Registration is denied | The SSO account needs the institutional-admin entitlement or an allowed temporary faculty/staff/employee affiliation. | Institution administrator |
| Pairing offer does not appear | Check that the operator used the current challenge, the challenge has not expired and the backend can reach Marketplace. Generate a new challenge if needed. | Backend operator |
| Wallet or backend origin is wrong | Cancel the pairing. Correct the backend configuration and generate a new challenge; never approve a mismatched read-only value. | Institution administrator/backend operator |
| No credit account or insufficient credits | Ask the institution administrator to confirm the account, funding order and spending limit. | Institution administrator/backend operator |
| Reservation stays pending | Check the dashboard and provider availability. An external provider must confirm the request before it becomes confirmed. | Provider operator or institution support |
| Reservation cannot be cancelled | Refresh the reservation. Completed, expired, access-authorized and already-cancelled states are not consumer-cancellable. | Institution/provider support |
| Access button is unavailable | Check that the reservation is confirmed or active, the current time is inside the access window and the SSO session is still valid. | Provider Gateway/operator |
| Access opens but the lab is unavailable | The provider must check Gateway health, backend authorization, Guacamole/Station or FMU configuration. | Provider operator |
| Metadata is rejected or not displayed | Validate the document with the [Lab-Metadata schema](https://github.com/DecentraLabsCom/Lab-Metadata/blob/main/docs/metadata-schema.md) and verify exact HTTPS origin trust. | Provider/backend operator |
| FMU cannot be found | Confirm that the `.fmu` file is provisioned in Lab Gateway/Lab Station and that the filename matches the provider configuration. | Provider Gateway/Station operator |

Do not send passwords, SAML assertions, bearer tokens, private keys, backend
credentials or full personal-data exports in a support request. The Marketplace
contact route is the live [Contact page](https://marketplace-decentralabs.vercel.app/contact).

Last reviewed: 2026-09-02
