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

`Lab Gateway/blockchain-services` validates the token against its configured Marketplace, public origin, chain, and Diamond address. It then signs the claims with its custodied institutional wallet. Marketplace recovers the signer and requires an exact match with `walletAddress`; wallet and backend values in the registration request body are ignored.

## Single use and recovery

Marketplace atomically consumes the `jti` with Redis `SET ... NX` after all signature and on-chain conflict checks and before the first privileged transaction. Redis is mandatory and registration fails closed if it is unavailable. The record is retained for at least `PROVISIONING_AUDIT_RETENTION_SECONDS` (default: one year) and is updated with transaction hashes after success.

Use one of the existing shared Redis REST credential pairs: `KV_REST_API_URL`/`KV_REST_API_TOKEN`, `UPSTASH_REDIS_REST_URL`/`UPSTASH_REDIS_REST_TOKEN`, or `SESSION_STORE_REST_URL`/`SESSION_STORE_REST_TOKEN`.

A consumed token cannot be retried. Recovery is explicit: correct the failure, issue a new token with a new `jti` and nonce, and apply that token. The old retry endpoint returns `409 Conflict` and does not submit a registration.
