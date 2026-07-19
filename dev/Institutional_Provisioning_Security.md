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
5. The SSO user approves the read-only pairing. Marketplace issues the final provisioning token from the approved pairing, and the backend retrieves it once using the original challenge and completes registration.

The backend origin is a root of trust: it is registered on-chain, is the token audience, and is the only metadata origin granted automatically for that institutional association. Sibling and child subdomains are not inferred from `institutionId`. Pairing records expire, store only a hash of the raw challenge, and the approved token is redeemed by an atomic `APPROVED -> TOKEN_RETRIEVED` transition. Successful redemption removes the raw token, token payload, challenge index, and active-pairing slot; only the token hash, JTI, retrieval timestamp, and terminal audit state remain. A later retrieval is rejected.

Pairing TTL is controlled by `PROVISIONING_PAIRING_TTL_SECONDS`, capped at 15 minutes and defaulting to 10 minutes. When approval issues a token, Redis retention is extended atomically through the token expiration, while the response and UI continue to expose the pairing expiration and token expiration separately. Redis is mandatory for creating, transitioning, and retrieving pairing records. Pairing creation, inspection, backend offers, approval, status polling, token redemption, and cancellation are rate-limited; the Marketplace UI polls with exponential backoff up to 10 seconds and can explicitly cancel an abandoned pairing.

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

### Audit failure and reconciliation

An audit write is part of the provisioning safety boundary. If Redis cannot
persist a confirmed stage, the provider/consumer route stops before issuing
the next write, attempts to mark the saga as `RECONCILIATION_REQUIRED`, and
emits a production operational alert. The optional
`PROVISIONING_ALERT_WEBHOOK_URL` receives only the JTI, stage, transaction
hashes, and error summary; no bearer token is sent.

The scheduled `Strict dependency resolution` workflow is separate from the
scheduled provisioning reconciler. The reconciler runs
`npm run reconcile:institution-provisioning` with `RPC_URL`,
`NEXT_PUBLIC_DIAMOND_CONTRACT_ADDRESS_SEPOLIA`, and the Redis REST credentials.
It compares each durable saga with on-chain provider, institution-role, and
backend-origin reads, then advances only stages confirmed by chain state.
An audit marked `FAILED` with transaction evidence is presented to operators
as `RECONCILIATION_REQUIRED`, never as a definitive failure.
