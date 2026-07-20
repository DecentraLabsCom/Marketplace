# Authentication & authorization

The provider-side Lab Gateway and the canonical `blockchain-services` backend decide whether a user with an institutional Marketplace session may enter a laboratory. Marketplace does not forward a personal wallet credential or provider secret to the browser.

## What is checked

When a user requests access during a reservation window, the backend verifies the institutional context and reservation state recorded on-chain. Marketplace then asks the provider gateway for an access credential.

- If consumer and provider use the same backend, Marketplace calls the combined authorization-and-issue path.
- If they use different backends, the consumer backend completes institutional check-in first and the provider backend issues the access credential second.
- The provider gateway validates the credential and creates the resource session only after those checks succeed.

## Credential handling

The browser receives a short-lived opaque access code, not a reusable signed lab-access JWT in a URL. The gateway redeems it once with a POST request, creates its secure session cookie and redirects to the resource without exposing the credential in query parameters.

For FMU access, Marketplace exchanges the access code server-side, binds the resulting capability to the Marketplace session and returns only the gateway origin required by the client flow.

## Provider responsibilities

1. Keep the Lab Gateway, backend and on-chain configuration aligned.
2. Configure the lab `accessKey` or FMU identifier only in provider-controlled infrastructure.
3. Do not place gateway credentials, private access URLs or user attributes in laboratory metadata.
4. Treat a Marketplace listing as catalogue visibility, not evidence that your remote endpoint is healthy.

See [Enable your lab for online access](enable-your-lab-for-online-access.md) for deployment prerequisites. The complete access sequence is maintained in the private developer documentation.
