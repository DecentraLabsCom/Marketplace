---
description: >-
  Institutional marketplace to list, browse and access online laboratories
---

# Marketplace dApp

### 🌍 About DecentraLabs

DecentraLabs is a community-driven initiative led by [Nebulous Systems](https://nebsyst.com/) in collaboration with international academic partners such as [UNED](https://www.uned.es/) and [Blockchain@UBC](https://blockchain.ubc.ca/). The current implementation uses federated institutional authentication, internal service credits that are not redeemable for cash, and managed institutional wallets. Wallet-based consumer reservations and external `$LAB` token flows are historical/proposed designs, not the active Marketplace flow.

### 🧪 DecentraLabs Marketplace

The DecentraLabs Marketplace is a decentralized platform where educational and research institutions, as well as original lab equipment manufacturers, can list their online laboratories and manage access conditions. In the implemented flow, students, teachers and researchers authenticate through institutional Single Sign-On (SSO); reservations are funded with internal service credits and settled through institution-managed accounts. Service credits are not a cash-redeemable token.

Each lab can be offered for free or for a fee, at the discretion of the provider. Access is controlled via smart contracts and enforced through a secure, tokenized infrastructure. This ensures transparency, verifiability, and fair rewards for contributors; all without centralized intermediaries.

DecentraLabs Marketplace aims to offer a curated catalog of online laboratories shared by leading educational and research institutions worldwide. Whether you’re looking to publish underused lab systems or access cutting-edge infrastructure for remote experiments, the DecentraLabs Marketplace is your gateway to a global, decentralized network of scientific collaboration.

#### 🔧 For Providers

Register and publish your online lab assets using smart contracts through the institutional backend.

Manage availability and access conditions.

Earn service credits as users reserve and utilize your labs.

Leverage a decentralized, tamper-proof system without intermediaries.

#### 🎓 For Consumers

Explore a growing catalog of online labs, from electronics to robotics.

Authenticate using institutional SSO (e.g., eduGAIN). Consumer wallet login is not part of the current reservation flow.

Make reservations using prepaid service credits, with smart-contract-backed guarantees.

Access labs remotely, safely, and on-demand.

#### 🛠️ Powered by

Ethereum-compatible smart contracts (ERC-2535 + NFTs + managed service-credit ledger).

Federated authentication for institutional users.

Open-source architecture, promoting transparency and collaboration.

### Institutional Intent Nonce Limitation

Marketplace runs as stateless Vercel functions in production. The on-chain intent registry uses a sequential anti-replay nonce per `signer`, so concurrent intent registrations from the same signer can collide if two functions read the same `nextIntentNonce(signer)` before the first registration is mined.

Intent preparation acquires a short-lived distributed lock in the configured Upstash/Vercel KV store, keyed by the normalized signer address. The lock covers nonce lookup, signing, transaction submission and receipt waiting, so another Vercel instance cannot read and submit the same pending nonce. Contention returns a retryable `409 INTENT_SIGNER_BUSY` response instead of sending a colliding transaction.

Production must therefore provide `KV_REST_API_URL` and `KV_REST_API_TOKEN` (or the equivalent `UPSTASH_REDIS_REST_*` / `SESSION_STORE_REST_*` pair). If the lock release request fails, the Redis TTL remains the safety net. A caller-supplied `requestId` is also carried into the signed intent when present, allowing retries to be reconciled against the contract's request ID.

### Distributed API rate limiting

Costly Marketplace routes use the same Redis REST coordinator with an operation-specific fixed window. Authenticated routes count IP, user and institution dimensions; unauthenticated or callback routes count the trusted Vercel client IP. Production fails closed with `503` if the coordinator is unavailable, rather than silently falling back to a per-instance counter. Responses include `Retry-After` when a limit is reached.

### Getting Started

This dApp is developed as a [Next.js](https://nextjs.org) project using the App Router.

Install the dependencies declared by the project:

```bash
npm ci
# or, when updating the lockfile intentionally:
npm install
```

Once the framework and the dependencies are installed, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the root layout at `src/app/layout.js` or the home page at `src/app/(app)/page.js`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

---

## Testing

We run **unit, integration and Cypress E2E tests**, plus linting, in CI on every push and pull request. The default Cypress journeys are intentionally deterministic and use controlled fixtures/intercepts; direct route-handler tests cover server behavior. The manual workflow remains available for rerunning E2E independently.

### Run tests locally

- Install deps: `npm ci`
- Runtime: Node.js 22 (see `.nvmrc` and `package.json#engines`)
- Run unit & integration tests: `npm test` (or `npm run test:ci` to run with coverage in CI mode)
- Run the critical server/intent/WebAuthn tests: `npm run test:critical`
- Run lint: `npm run lint` or `npm run test:lint:cypress` (validates Cypress files do not trigger `no-undef` errors like `expect`)

### SAML stable user ID mode

`NEXT_PUBLIC_SAML_STABLE_USER_ID_MODE` controls how Marketplace derives the stable SSO user identifier from SAML attributes:

- `principal_targeted_id` (default): `eduPersonPrincipalName|eduPersonTargetedID` when `eduPersonTargetedID` is received, otherwise `eduPersonPrincipalName`.
- `principal`: always use only `eduPersonPrincipalName`.

### Institutional backend egress

Marketplace resolves institutional backends only from the authenticated SSO institution and its on-chain institutional registry. The resolved origin must use HTTPS in production and is checked for public DNS resolution; requests use DNS pinning and reject redirects.

### Current deployment and chain

The active Marketplace deployment is `https://marketplace-decentralabs.vercel.app`. Server-generated callbacks use `NEXT_PUBLIC_BASE_URL` when it is configured and otherwise use the environment-aware fallback in `src/utils/env/baseUrl.js`; documentation and integrations must not substitute the marketing-site domains for this origin. The current contract configuration defaults to the Sepolia deployment. Ethereum mainnet is not the active production target merely because a network option exists in the SDK; a mainnet release requires its own configured contract addresses and deployment validation.

### Session storage

The browser receives only an opaque `__Host-user_session` identifier. The SAML assertion is encrypted and retained server-side for no longer than the session TTL. Production deployments must configure `SESSION_STORE_REST_URL` and `SESSION_STORE_REST_TOKEN` (or the equivalent `KV_REST_API_URL`/`KV_REST_API_TOKEN` pair) plus `SESSION_ENCRYPTION_KEY`.

### Service-credit policy

Service credits are internal settlement units: they cannot be converted into cash. An eligible cancellation before the access period, or a reservation for which the service is not completed or received, returns the applicable credits to the institutional credit account through the reservation lifecycle. Completed or expired services are not automatically recoverable; service-failure claims follow the institution's separate review process.

### Metadata egress

External laboratory metadata is requested through `/api/metadata?labId=<id>&uri=<uri>`. The server verifies the lab owner on-chain, confirms that the owner is a registered provider, and trusts the provider's on-chain institutional backend origins. `ALLOWED_METADATA_ORIGINS` is optional and can extend that trust for explicitly configured metadata hosts. Local `Lab-*.json` metadata is read only from the repository `data/` directory and does not require `labId`.

### Public marketplace catalogue

The public catalogue is served by `/api/market/labs` as a paginated, public DTO. It accepts `includeUnlisted`, `cursor` and `limit` query parameters; the default page size is 24 and the maximum is 100. The home page renders the first server-side page into the initial React Query cache, and subsequent pages are requested only when the user selects `Load more labs`.

The route caches each page for 60 seconds and exposes `Server-Timing`, `X-Market-RPC-Calls` and `X-Market-Payload-Bytes` response headers for performance observability. Credentials, access URLs, provider contact details and raw on-chain structures are intentionally excluded from this public DTO.

The normal catalogue is listed-only. `includeUnlisted=true` is an explicit discovery/administration view used by the catalogue filter; an unlisted lab is labelled as such and is not eligible for public booking. If the listing status cannot be read, the lab is excluded from the default public view rather than being treated as listed.

### Metadata and laboratory files

The Marketplace does not promise decentralized metadata storage by default. Local `Lab-*.json` metadata is stored in the repository `data/` directory during development and in Vercel Blob in production. Quick Setup can reference an external HTTPS document only when its origin is trusted through the provider's on-chain institutional registration or the optional `ALLOWED_METADATA_ORIGINS` extension. A decentralized store therefore needs an accepted HTTPS gateway; an `ipfs://` URI is not automatically trusted. The Marketplace FMU upload route is intentionally disabled: `.fmu` files must be provisioned on the provider's Lab Gateway/Lab Station and registered by `accessKey`.

### Browser security policy

Page responses receive a per-request nonce-based Content Security Policy from `src/proxy.js`, including `frame-ancestors 'none'`, `object-src 'none'`, restricted images and no production `unsafe-eval`. The application also sets HSTS in production, `nosniff`, `X-Frame-Options`, `Referrer-Policy` and `Permissions-Policy`. Configure exact comma-separated origins in `CSP_CONNECT_SRC`, `CSP_FRAME_SRC` and `CSP_IMG_SRC` when the deployment knows the institutional backends, embedded document hosts or image hosts in advance. If `CSP_FRAME_SRC` is not configured, only same-origin frames are allowed. Production browser source maps are disabled; private maps should be uploaded to the observability system during deployment.

### Run E2E tests locally

To run E2E tests locally (recommended):

1. Start the development server:

```bash
npm run dev
# or
npm run build && npm start
```

2. Run Cypress in interactive mode:

```bash
npm run cy:open
```

or headless:

```bash
npm run cy:run
```

Notes:
- Ensure any environment variables required by the app or Cypress are set before running E2E tests locally.
- CI runs Cypress on every push and pull request. The manual workflow `Cypress E2E (manual)` remains available in GitHub Actions for an independent rerun.

### Required CI checks

For protected branches, require the checks `Tests & Coverage`, `Cypress E2E`,
`ESLint`, `Analyze Code` and `Lighthouse Audit`. The first two exercise the
application behavior; the latter three protect code quality, security and
regressions in the deployed shell.

### Learn More

For project and company information, visit the [DecentraLabs marketing site](https://decentralabs.nebsyst.com/). This is separate from the active Marketplace origin documented above.

To learn more about Next.js, take a look at the following resources:

* [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
* [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

### Deploy on Vercel

The easiest way to deploy an Next.js app like this is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template\&filter=next.js\&utm_source=create-next-app\&utm_campaign=create-next-app-readme) from the creators of Next.js.

### JWT Key Rotation & Public Key Availability

- RSA keys for JWT signing live under certificates/jwt/ (ignored from git). The public verification key is committed at public/.well-known/public-key.pem so Vercel serves it automatically at /.well-known/public-key.pem.
- The quarterly workflow .github/workflows/jwt-key-rotation.yml runs npm run rotate-jwt-keys, backs up the previous pair, pushes the new private key to Vercel env vars and **auto-syncs the regenerated public key** into public/.well-known/public-key.pem.
- For manual rotations run npm run rotate-jwt-keys --force. The script copies the freshly generated public key to the .well-known folder, so committing that file keeps the hosted endpoint aligned with whatever private key you deploy.
- After any rotation trigger a deployment (or let the workflow do it), then verify both /api/auth/test-jwt and /.well-known/public-key.pem to ensure auth-service caches the new key.
