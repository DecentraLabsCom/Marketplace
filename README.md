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

## Documentation and release records

Use [`docs/README.md`](docs/README.md) as the canonical documentation index. It
routes users to the access guide, providers to the institutional onboarding and
lab-publication guides, and operators/developers to the security and intent
specifications. The public FAQ is served at `/faq`; privacy, terms, cookies and
security are served from the marketing routes and are explicitly labelled as
operational governance pages until legal approval is recorded.

The tracked package version is in `package.json`; the deployment/cache boundary
is `NEXT_PUBLIC_RELEASE_ID`. Every release must update [`CHANGELOG.md`](CHANGELOG.md)
and follow [`docs/RELEASE_PROCESS.md`](docs/RELEASE_PROCESS.md). Historical PDFs
that describe MetaMask, wallet authentication or `$LAB` payments are archived
and are not valid instructions for the current SSO and service-credit flow.

---

## Testing

We run **unit, integration and Cypress E2E tests**, plus linting and a production dependency audit, in CI on every push and pull request. The default Cypress journeys are intentionally deterministic and use controlled fixtures/intercepts; direct route-handler tests cover server behavior.

### Run tests locally

- Install deps: `npm ci`
- Runtime: Node.js 22 (see `.nvmrc` and `package.json#engines`)
- Run unit & integration tests: `npm test` (or `npm run test:ci` to run with coverage in CI mode)
- Run the critical server/intent/WebAuthn tests: `npm run test:critical`
- Run lint: `npm run lint` or `npm run test:lint:cypress` (validates Cypress files do not trigger `no-undef` errors like `expect`)
- Audit runtime dependencies: `npm run audit:production` (fails on high or critical vulnerabilities)

### SAML stable user ID mode

`NEXT_PUBLIC_SAML_STABLE_USER_ID_MODE` controls how Marketplace derives the stable SSO user identifier from SAML attributes:

- `principal_targeted_id` (default): `eduPersonPrincipalName|eduPersonTargetedID` when `eduPersonTargetedID` is received, otherwise `eduPersonPrincipalName`.
- `principal`: always use only `eduPersonPrincipalName`.

### SAML Single Logout

The SP metadata publishes `/api/auth/sso/saml2/logout` with the HTTP-POST binding. The endpoint accepts IdP-initiated `SAMLRequest` messages, matches the issuer to the `entityID` from the configured IdP metadata, verifies the XML signature with the metadata signing certificate, clears local sessions, and returns a correlated `LogoutResponse` through the IdP's HTTP-Redirect SLO endpoint.

Set `NEXT_PUBLIC_SAML_SP_LOGOUT_URL` to the public Marketplace URL for `/api/auth/sso/saml2/logout` in each deployment. `NEXT_PUBLIC_SAML_IDP_METADATA_URL` must point to the authoritative RedIRIS/EduGAIN IdP metadata used by the deployment.

### Institutional backend egress

Marketplace resolves institutional backends only from the authenticated SSO institution and its on-chain institutional registry. The resolved origin must use HTTPS in production and is checked for public DNS resolution; requests use DNS pinning and reject redirects.

`ALLOWED_INSTITUTIONAL_BACKEND_ORIGINS` is not part of this flow and must not be added back as a normal onboarding control. Backend discovery is cached for at most 60 seconds. With the production Redis coordinator configured, the cache, emergency denylist and circuit breaker are shared across Marketplace instances. A confirmed provider/consumer backend registration invalidates the shared entry immediately. Platform administrators can temporarily isolate an institution through `POST /api/admin/institutions/backend-revocation` with `{ "institutionId", "ttlSeconds" }`, and restore it with `DELETE` and `{ "institutionId" }`.

### Current deployment and chain

The active Marketplace deployment is `https://marketplace-decentralabs.vercel.app`. Server-generated callbacks use `NEXT_PUBLIC_BASE_URL` when it is configured and otherwise use the environment-aware fallback in `src/utils/env/baseUrl.js`; documentation and integrations must not substitute the marketing-site domains for this origin. The current contract configuration defaults to the Sepolia deployment. Ethereum mainnet is not the active production target merely because a network option exists in the SDK; a mainnet release requires its own configured contract addresses and deployment validation.

### Session storage

The browser receives only an opaque `__Host-user_session` identifier. The complete server-side identity record, including the SAML assertion, is encrypted and retained no longer than the session TTL. Production deployments must configure `SESSION_STORE_REST_URL` and `SESSION_STORE_REST_TOKEN` (or the equivalent `KV_REST_API_URL`/`KV_REST_API_TOKEN` pair) plus a dedicated `SESSION_ENCRYPTION_KEY` (never reused as `SESSION_SECRET`).

### Service-credit policy

Service credits are internal settlement units: they cannot be converted into cash. An eligible cancellation before the access period, or a reservation for which the service is not completed or received, returns the applicable credits to the institutional credit account through the reservation lifecycle. Completed or expired services are not automatically recoverable; service-failure claims follow the institution's separate review process.

### Metadata egress

External laboratory metadata is requested through `/api/metadata?labId=<id>&uri=<uri>`. The server verifies the lab owner on-chain, confirms that the owner is a registered provider, and trusts only that provider's on-chain institutional backend **exact origins**. `institutionId` establishes the provider-to-institution association; it does not prove control of sibling or child hostnames. For example, registering `https://gateway.university.edu` does not trust `https://metadata.university.edu`.

Use a reviewed global exception only for shared or external metadata infrastructure. Platform administrators can manage dynamic exceptions, including owner, reason and creation date, at `/api/admin/metadata-origin-exceptions`; revocation is immediate and does not require a deployment. Local `Lab-*.json` metadata is read only from the repository `data/` directory and does not require `labId`.

### Public marketplace catalogue

The public catalogue is served by `/api/market/labs` as a paginated, public DTO. It accepts `includeUnlisted`, `cursor`, `limit`, `q`, `searchField` (`keyword` or `name`), `category`, `provider`, `resourceType` (`lab` or `fmu`) and `sort` (`price_asc` or `price_desc`). Search, filtering and sorting run against the server-side catalogue before cursor pagination, so a matching lab is not hidden merely because its original page has not yet been downloaded. The default page size is 24 and the maximum is 100. The home page renders the first server-side result and its filter facets into the initial React Query cache; subsequent result pages are requested only when the user selects `Load more labs`.

The route caches each page for 60 seconds and exposes `Server-Timing`, `X-Market-RPC-Calls` and `X-Market-Payload-Bytes` response headers for performance observability. Behind it, Marketplace keeps a Redis-backed read-model snapshot (with an in-process fallback for development) for five minutes by default, so ordinary catalogue requests do not repeat the per-lab RPC and metadata fan-out. When filters need several source pages, Marketplace loads at most two pages concurrently, reducing cold-cache latency without multiplying RPC pressure without bound. Stale pages are refreshed in the background under a short shared Redis lock, preventing multiple Vercel instances from rebuilding the same page at once. Set `MARKET_SNAPSHOT_REVALIDATE_SECONDS` (30–3600, default `300`) to tune that interval; `MARKET_SNAPSHOT_RETENTION_SECONDS` controls how long the last valid snapshot is retained.

If chain revalidation fails, Marketplace serves the last valid snapshot with `catalogueStatus: "stale"`, a visible timestamp, and no CDN cache. If there is no valid snapshot, the API returns non-cacheable `503` with `catalogueStatus: "unavailable"`; it never represents an infrastructure outage as an empty catalogue. Credentials, access URLs, provider contact details and raw on-chain structures are intentionally excluded from this public DTO.

The normal catalogue is listed-only. `includeUnlisted=true` is an explicit discovery/administration view used by the catalogue filter; an unlisted lab is labelled as such and is not eligible for public booking. If the listing status cannot be read, the lab is excluded from the default public view rather than being treated as listed.

### Metadata and laboratory files

The Marketplace does not promise decentralized metadata storage by default. Local `Lab-*.json` metadata is stored in the repository `data/` directory during development and in Vercel Blob in production. Quick Setup can reference an external HTTPS document only when its exact origin equals one of the provider's registered on-chain backend origins or is a reviewed global metadata exception. A decentralized store therefore needs an accepted HTTPS gateway; an `ipfs://` URI is not automatically trusted. The Marketplace FMU upload route is intentionally disabled: `.fmu` files must be provisioned on the provider's Lab Gateway/Lab Station and registered by `accessKey`.

Images and documents declared by trusted metadata are served through same-origin Marketplace proxies. Images are decoded, size-limited and re-encoded as WebP before reaching the browser; documents are restricted to PDF, text, DOC and DOCX, and PDFs are signature-checked. This means provider onboarding does not require adding provider image hosts to Next.js `remotePatterns` or `CSP_IMG_SRC`.

Malware scanning is optional. To enable it, set `DOCUMENT_MALWARE_SCAN_URL` to an HTTPS endpoint and optionally set `DOCUMENT_MALWARE_SCAN_TOKEN`. The scanner receives the raw document body with its content type and must return JSON `{ "clean": true }`. If `DOCUMENT_MALWARE_SCAN_URL` is absent, uploads and proxied documents continue after the other validations but are explicitly unscanned; this is suitable for deployments such as a personal Vercel instance without an antivirus service. Regardless of scanner configuration, documents still require trusted declarations, HTTPS, an allowed type, a size within the configured limit, and a valid PDF signature. If a scanner is configured but unavailable or returns any other verdict, the operation fails closed.

Only public catalogue and metadata React Query entries are persisted in the browser. Logout removes the persisted snapshot and all reservation/booking queries. Set `NEXT_PUBLIC_RELEASE_ID` on each release to rotate the public-cache buster.

### Browser security policy

Page responses receive a per-request nonce-based Content Security Policy from `src/proxy.js`, including `frame-ancestors 'none'`, `object-src 'none'`, restricted images and no production `unsafe-eval`. The application also sets HSTS in production, `nosniff`, `X-Frame-Options`, `Referrer-Policy` and `Permissions-Policy`. Institutional HTTPS/WSS traffic is relayed through same-origin Marketplace routes, so provider onboarding must not add individual backends to `CSP_CONNECT_SRC`, `CSP_IMG_SRC`, or Next.js `remotePatterns`. Configure exact sources only for deliberate browser-direct integrations; if `CSP_FRAME_SRC` is not configured, only same-origin frames are allowed. Production browser source maps are disabled; private maps should be uploaded to the observability system during deployment.

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

### Live integration verification

The protected `Live integration verification` workflow tests a deployed Marketplace without fixtures: it requests the real catalogue, uses a short-lived opaque test session to load an authenticated route, writes/reads/deletes an isolated Vercel Blob object, and runs Lighthouse on authenticated dashboard and reservation pages. It is manual because it requires the protected `integration` environment with:

- variable `MARKETPLACE_INTEGRATION_URL`;
- secret `MARKETPLACE_E2E_SESSION_ID`, a disposable 43-character opaque session ID; and
- secret `BLOB_READ_WRITE_TOKEN` for the dedicated Blob store.

The Blob test deletes its uniquely named `integration-tests/marketplace/` object in a `finally` block. Run it locally only through `npm run test:integration:blob` with the same token; run the deployed Cypress lane with `CYPRESS_BASE_URL`, `CYPRESS_LIVE_INTEGRATION=true` and `CYPRESS_LIVE_SESSION_ID`.

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
