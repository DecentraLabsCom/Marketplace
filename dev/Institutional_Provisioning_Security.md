# Institutional provisioning security and audit

DL-MKT-001 is addressed by a single provisioning contract shared by provider and consumer registrations.

## Authorization

Provisioning token issuance requires an SSO session with either the exact `eduPersonEntitlement` value:

```text
urn:decentralabs:entitlement:institution-admin
```

or, under the current temporary policy, an `eduPersonAffiliation`/scoped affiliation containing `faculty`, `staff`, or `employee`. Explicitly denied affiliations such as `student`, `alum`, and `library-walk-in` are rejected.

This exception applies only to issuing and applying an institutional registration. It does not grant platform administration or destructive provider-management privileges, which continue to require the exact entitlement. The SP metadata still requests `eduPersonEntitlement` as an optional attribute for those administrative actions.

The token's `institutionId` is derived only from the verified SAML session. Organization values sent by the browser are ignored.

## Institutional pairing

Registration uses a short-lived challenge:

1. Marketplace creates a Redis-backed pairing record from the verified SAML institution and registration type. It returns only a random challenge and deployment context.
2. `blockchain-services` receives the challenge and calls Marketplace server-to-server. It obtains its wallet from `InstitutionalWalletService` and its public origin from `public.base-url`; neither value is read from the browser form.
3. The backend signs an EIP-712 `InstitutionProvisioningPairing` declaration covering the institution, wallet, canonical backend origin, registration type, chain, registry contract, challenge, and timestamps.
4. Marketplace validates the challenge, deployment values, signature, and recovered signer, then shows the wallet and backend origin read-only to the SSO user.
5. The SSO user approves the read-only pairing. Marketplace issues the final provisioning token from the approved pairing, and the backend retrieves it using the original challenge and completes registration.

The backend origin is a root of trust: it is registered on-chain, is the token audience, and is the only metadata origin granted automatically for that institutional association. Sibling and child subdomains are not inferred from `institutionId`. Pairing records expire, store only a hash of the raw challenge, and cannot be reused after the backend offer or approval state transition.

Pairing TTL is controlled by `PROVISIONING_PAIRING_TTL_SECONDS`, capped at 15 minutes and defaulting to 10 minutes. Redis is mandatory for creating, transitioning, and retrieving pairing records.

## Signed contract

The RS256 provisioning token and the institutional wallet's EIP-712 proof cover the same security fields:

```text
institutionId
walletAddress
canonicalBackendOrigin
registrationType
chainId
registryContract
jti
nonce
issuedAt
expiresAt
```

The EIP-712 domain is `DecentraLabsInstitutionProvisioning`, version `1`, with the claim's `chainId` and `registryContract`. The canonical backend value is an HTTPS origin without credentials, path, query, or fragment. HTTP is accepted only for loopback development origins.

`Lab Gateway/blockchain-services` validates the token against its configured Marketplace, public origin, chain, and Diamond address. It signs the pairing claims and later the final provisioning claims with its custodied institutional wallet. Marketplace recovers the signer and requires an exact match with `walletAddress`; wallet and backend values in registration request bodies are ignored.

## Durable recovery and signer coordination

Marketplace creates one immutable, durable provisioning saga per `jti` with Redis `SET ... NX`, after all signature checks. Redis is mandatory and registration fails closed if it is unavailable. The saga retains the signed claims, the last confirmed stage, transaction hashes, and a fencing token for at least `PROVISIONING_AUDIT_RETENTION_SECONDS` (default: one year).

Use one of the existing shared Redis REST credential pairs: `KV_REST_API_URL`/`KV_REST_API_TOKEN`, `UPSTASH_REDIS_REST_URL`/`UPSTASH_REDIS_REST_TOKEN`, or `SESSION_STORE_REST_URL`/`SESSION_STORE_REST_TOKEN`.

A retry with the same still-valid token and wallet proof resumes that same saga. Marketplace reconciles the chain state while holding a renewable distributed lease for the actual server signer, and executes only the missing writes. The lease is renewed throughout a long transaction wait and is checked immediately before every privileged write; a lost lease fails closed. A token cannot start a different saga or alter any of its signed claims. Once it has expired, recovery requires a newly issued token with a new `jti` and nonce.

Provider and consumer provisioning, as well as signed intent preparation, use that same signer-specific lease. This serializes transactions from the shared wallet and prevents concurrent nonce allocation from racing across endpoints or instances.
