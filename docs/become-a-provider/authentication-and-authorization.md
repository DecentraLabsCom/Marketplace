# Access security for providers

The provider-side Lab Gateway and the institutional backend decide whether a
user with a valid Marketplace session may enter a laboratory. Marketplace does
not forward a personal wallet credential or provider secret to the browser.

## What happens when a user selects Access

1. Marketplace checks the institutional session, reservation ownership and
   active reservation window.
2. The consuming institution's backend performs institutional check-in when it
   is separate from the provider backend.
3. The provider backend and Gateway issue and validate a short-lived access
   credential for the requested laboratory.
4. The Gateway creates the remote desktop or FMU session and closes it when the
   valid access window ends.

When consumer and provider use the same backend, the authorization and issue
steps may be combined. When they use different backends, the consumer check-in
must complete before the provider credential is issued.

The browser receives an opaque, short-lived access code. A reusable signed
credential is not placed in a URL; the Gateway redeems it server-side, creates
its own secure session and redirects the user to the resource.

## Provider responsibilities

1. Keep the Gateway, institutional backend and on-chain provider/lab
   configuration aligned.
2. Keep the Gateway's public origin, TLS certificate and access route healthy.
3. Configure the physical lab access key or FMU filename only in
   provider-controlled infrastructure.
4. Do not place Gateway credentials, private access URLs, tokens or user
   attributes in laboratory metadata.
5. Test a complete user session after changes to the backend, Gateway, Station,
   access route or FMU configuration.
6. Treat a Marketplace listing as catalogue visibility, not evidence that the
   remote endpoint is healthy.

For deployment prerequisites, see [Enable your lab for online access](enable-your-lab-for-online-access.md).
For ongoing responsibilities, see [Operate your laboratory](../provider/operate-your-lab.md).

Last reviewed: 2026-09-02
