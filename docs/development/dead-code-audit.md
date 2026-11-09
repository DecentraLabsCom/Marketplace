# Marketplace dead-code review

Reviewed on 2026-11-09 against `feature/digital-twins`, starting at `fb4cc36b`.

## Scope and method

The review covers application code, API routes, the digital-twin SDK workspace,
scripts, Cypress/Jest support, root configuration, CSS and public assets.
Generated output and installed dependencies are excluded from source analysis.
Local preview sources ignored by Git were included in the scan.

Evidence was combined from Knip, an independent TypeScript AST import graph,
export/import checks, ESLint, literal URL/asset searches and inspection of the
canonical Gateway backend consumers. Scanner findings were reviewed rather
than applied automatically. Next.js convention files, dynamic imports, CLI
scripts and SDK package exports were treated as entry points.

## Confirmed cleanup

56 files were removed: 30 application source files, 12 test files for removed
implementations, 4 unused test helpers/mocks, 9 unused SVG assets and the legacy
ESLint configuration. Tests for active behavior remain in place.

| Area | Removed or simplified |
| --- | --- |
| Provider UI | Unused `LabFormWizard`, `LabManagementActions`, `InstitutionProviderRegister` and unused form props/refs |
| Shared UI | Unused `ConfirmModal`, `FileUploadManager`, generic `Form` components and form skeletons; unused barrel exports |
| Hooks | Unused user composed queries, onboarding-session hook, lab-validation hook and booking extraction helpers |
| Booking/date helpers | Unused validation, active-booking, pricing and time helper modules and their isolated tests |
| Wallet/staking remnants | Wallet connection helpers, staking constants/toasts, unused SSO selector and asynchronous-storage shim |
| Other helpers | Duplicate API BigInt serializer, development seed data, unused design-system JS, unused image hooks and a no-op decimals-cache API |
| API mutations | Unused provider update/removal routes and their obsolete tests/mocks |
| Assets/CSS | Next.js starter SVGs, unused wallet SVGs, old country-selector styles and unused separator/spinner/animation rules |

More than 130 unused exports/re-exports/default aliases were removed or made
private. Unreferenced private declarations, unused imports, catch bindings and
props were also removed. Shared implementations that are still called remain.

The provider update route always rejected execution with a wallet/intent hint.
The provider removal route attempted a write using the default read-only
contract instance. Neither had a UI, script, documented integration or canonical
backend consumer. Institutional intent services remain the mutation path.

## Dependencies and configuration

Removed production dependencies:

- `@coinbase/wallet-sdk`, `@safe-global/safe-apps-provider`,
  `@safe-global/safe-apps-sdk`, `porto`, `wagmi`.
- `@simplewebauthn/server`, `@vercel/analytics`, `cookie`, `react-flags-select`.

Chain definitions now come directly from `viem/chains`; Wagmi re-exported those
same definitions. The old Wagmi mock, storage alias, Dependabot entry and wallet
integration guidance were removed or updated.

Removed direct development dependencies: `@eslint/eslintrc`,
`baseline-browser-mapping`, `eslint-plugin-drizzle`, `eslint-plugin-react`,
`eslint-plugin-react-hooks`, `jsdom`, `msw`, `pino-pretty`, `typescript-eslint`.
Dependencies owned by `eslint-config-next` or the Jest environment remain
transitively available. The ESLint config's direct imports
`@typescript-eslint/parser` and `globals` are now declared explicitly.

The lockfile removes 94 package entries and changes no retained package
versions. The unused `hono` override was removed. `npm ls --depth=0` passes.
ESLint now warns about unused JavaScript variables/imports; positional callback
parameters and rest-sibling omission patterns are preserved.

## Preserved entry points and reviewed findings

- **All three FMU paths:** external proxy-FMU download, generated GLB app and
  custom SDK app. No Gateway simulation transport or authorization contract was
  removed.
- **Public SDK exports and schemas:** absence of an internal consumer does not
  identify an unused external SDK API. The scene-presentation public signature
  remains compatible; only an unused argument name/private helper changed.
- **M2M/provisioning/JWKS:** institution registration, pairing, provisioning-key
  discovery and demo eligibility have Gateway/backend consumers. They remain.
- **Read APIs without local UI calls:** institution pagination, user limit,
  remaining allowance, spending data and credit decimals remain callable API
  entry points. Their contract methods exist in the checked-in ABI; decimals is
  an intentional static ledger configuration endpoint.
- **Hooks and test access:** some atomic query/mutation variants, extractor
  utilities and named exports have tests but no current UI caller. These are
  reported separately from unreachable files: internal use, domain barrels and
  test-only access must be considered before removing each exported symbol.
  Test reset hooks and exports that expose a live private implementation for
  focused tests are retained.
- **Local demo build inputs:** DC Motor and Mass Spring app/build/scene sources
  are manual build entry points. They generate external demo artifacts and were
  preserved.
- **Two local reference candidates:** `lateralMotionReference.js` and
  `lateralMotionSchedule.js` have no imports or build consumers found. They are
  ignored/unversioned reference files outside the shipped application and were
  left in the local workspace.
- **Brand originals:** unused-by-code original logo variants are retained as
  public design resources, alongside active favicons, certificates, JWKS and
  authorization assets.
- **Scanner false positives:** `FmuFieldsSection`, `labFormUtils`, image/document
  previews, classification/calendar exports and dynamic viewers have verified
  consumers. Tailwind and its forms/typography plugins are loaded from CSS.
  None was deleted based on a scanner warning.

After cleanup the independent import graph reports no orphaned versioned
application file. Its remaining local roots are the four manual app/build
entry points and the two unversioned reference candidates above. This does not
assert that every externally callable API or test-covered export is used by a
currently rendered screen.

## Validation

- Full Jest: 310 suites and 3,361 tests passed; 1 suite/test skipped.
- Follow-up dashboard/booking checks after removing the ignored wallet-address
  prop chain: 4 suites, 58 tests passed.
- Cypress against an isolated production server: 12/12 passed across navigation
  smoke checks and the FMU provider/create/detail flow.
- Scene-presentation export: 8/8 passed.
- App archive: 2 passed; the symbolic-link case was skipped because Windows
  denied creating the test symlink.
- Production build, public documentation checks, dependency tree and diff
  whitespace checks passed.

The baseline full Jest run passed 3,713 tests before removing obsolete
implementations and their tests. The lower final count reflects those removals;
active dashboard, booking, identity, intent, API and simulation suites remain.

Lint reports no unused JavaScript variable/import warnings. Two existing
Next.js internal-navigation warnings remain in `LabAccess` and `account.js`;
changing navigation behavior is outside this cleanup.

## Cross-project consumer verification

The follow-up review includes all cleanup commits from `117763a4` through
`e3ecb840`, covering 69 deleted files, 237 removed/private named exports and
seven removed HTTP routes. Consumers were checked in Lab Gateway at `0b5fa44`
and its canonical `blockchain-services` checkout at `5b9cced`. The root
backend mirror was not used.

The reference scan examined 980 Gateway text files and 544 backend text files,
including implementation, browser assets, scripts, configuration templates,
tests and documentation. It checked 381 path/name patterns, then traced the
actual outbound HTTP clients, base-URL builders and role-derived endpoints.

No consumer of a deleted Marketplace module or HTTP route was found. The
removed routes are the two old provider mutation adapters and
`/api/simulations/{history,result,run,stream,upload}`. The similarly named
Gateway simulation endpoints remain independent and unchanged.

The preserved external contracts were checked for HTTP method, route presence
and unchanged source against the pre-cleanup Marketplace tree:

| Consumer | Marketplace contract |
| --- | --- |
| Backend `InstitutionRegistrationService` / `InstitutionRole` | `POST /api/institutions/registerProvider`, `POST /api/institutions/registerConsumer` |
| Backend pairing client | `POST /api/institutions/provisioning/pairings/inspect`, `/offer`, `/token` |
| Backend `ProvisioningTokenService` | `GET /api/institutions/provisionToken/jwks`, `GET /api/institutions/provisionConsumer/jwks` |
| Backend `MarketplaceKeyService` / JWT validation | `GET /.well-known/jwks.json`, `GET /.well-known/public-key.pem` |
| Full/Lite Gateway demo guards and readiness | `GET /api/demo/eligibility` |

All ten method/path contracts remain present and unchanged. The active
`useInstitutionalOnboarding` hook, `/api/onboarding/session`, and the WebAuthn
`key-status` and `options` proxy routes are also unchanged. The deleted
`useOnboardingSession` was an unused React wrapper; the session endpoint and
the backend's WebAuthn controllers/services were preserved.

Name matches such as `normalizePeriodUnit`, classification constants and Java
credit-conversion constants were inspected. They are defined and consumed
within Gateway/backend code, without imports of the removed Marketplace
exports. The SDK package entry points and runtime message contracts remain
available to Gateway-served apps.

Additional checks passed:

- Backend: 98 tests covering institutional registration, provisioning tokens,
  Marketplace JWKS/JWT verification, WebAuthn onboarding and SAML sessions.
- Gateway: 256 Lua tests using the local production image's dependencies and a
  read-only mount of the current source. Running bare LuaJIT required explicitly
  adding OpenResty's Lua/C module paths.
- Marketplace onboarding/access/API group: 96 tests across 11 suites.
- Marketplace registration/pairing/demo/FMU group: 55 tests across 7 suites
  (partially overlaps the previous group).

The Gateway documentation still described the retired generic results viewer
and `SimulationRunner` stream proxy. Its FMU/visual-assets guides were corrected
to describe the proxy-FMU download flow. No runtime consumer needed restoration.

These checks validate the current repositories and their declared contracts;
they do not replace a live institutional WebAuthn/reservation ceremony against
every independently deployed backend or custom third-party client.
