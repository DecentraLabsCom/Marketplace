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

Before issuing a token, Marketplace shows the verified institution identifier, wallet, exact canonical backend origin and registration type, and requires an explicit acknowledgement. The backend origin is a root of trust: it is registered on-chain, is the token audience, and is the only metadata origin granted automatically for that institutional association. Sibling and child subdomains are not inferred from `institutionId`.

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

## Durable recovery and signer coordination

Marketplace creates one immutable, durable provisioning saga per `jti` with Redis `SET ... NX`, after all signature checks. Redis is mandatory and registration fails closed if it is unavailable. The saga retains the signed claims, the last confirmed stage, transaction hashes, and a fencing token for at least `PROVISIONING_AUDIT_RETENTION_SECONDS` (default: one year).

Use one of the existing shared Redis REST credential pairs: `KV_REST_API_URL`/`KV_REST_API_TOKEN`, `UPSTASH_REDIS_REST_URL`/`UPSTASH_REDIS_REST_TOKEN`, or `SESSION_STORE_REST_URL`/`SESSION_STORE_REST_TOKEN`.

A retry with the same still-valid token and wallet proof resumes that same saga. Marketplace reconciles the chain state while holding a renewable distributed lease for the actual server signer, and executes only the missing writes. The lease is renewed throughout a long transaction wait and is checked immediately before every privileged write; a lost lease fails closed. A token cannot start a different saga or alter any of its signed claims. Once it has expired, recovery requires a newly issued token with a new `jti` and nonce.

Provider and consumer provisioning, as well as signed intent preparation, use that same signer-specific lease. This serializes transactions from the shared wallet and prevents concurrent nonce allocation from racing across endpoints or instances.
