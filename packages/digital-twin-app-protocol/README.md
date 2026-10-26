# @decentralabs/digital-twin-app-protocol

Optional browser clients and schemas for provider web apps. Simulation traffic
flows directly between the app and the provider Gateway, using the same
reservation-ticket WebSocket as `proxy.fmu`. Marketplace only hands the app a
one-use connection grant and optional visualization controls.

## Entry points

* Package root: host integration **v2** constants, validators and TypeScript types.
* `/fmu-client`: `connectFmuSession(grant)`, a direct Gateway WS client with no
  dependency on Marketplace or a parent window.
* `/client`: `createDigitalTwinAppClient()`, composing direct execution with
  optional Marketplace startup, authorization and visualization integration.
* `/schema-v2`: the JSON Schema for the host messages.

There are no runtime dependencies. Bundle the desired entry, or copy
`index.js`, `fmu-client.js` and `client.js` into a static ZIP's `sdk/` directory.
The package does not register modules or impose an SDK requirement on providers.

```js
import { createDigitalTwinAppClient } from './sdk/client.js'
const app = createDigitalTwinAppClient({
  onSamples(samples) { timeline.append(samples) },
  onReset() { timeline.clear() },
  onResultsComplete({ state }) { showResult(state) },
  onPlaybackRate(rate) { replay.setRate(rate) },
})
initializeView().then(() => app.reportReady())
runButton.onclick = () => app.run({ parameters: readInputs(), options: { stopTime: 60 } }).catch(showError)
window.addEventListener('pagehide', () => app.dispose(), { once: true })
```

For standalone use, supply a `getConnection({ options, signal })` callback
returning a connection grant from your own authorized backend. For direct FMI
session operations without the host client:

```js
import { connectFmuSession } from './sdk/fmu-client.js'
const session = await connectFmuSession(grant, { signal })
const model = await session.request('model.describe', 'model.description', { includeVariables: false })
await session.request('sim.initialize', 'sim.state', { parameters, options })
const batch = await session.request('sim.advance', 'sim.samples', { targetTime: 60, maxSamples: 256 })
session.close()
```

The current Gateway session runtime executes FMI 2/3 Co-Simulation. The
convenience runner requires FMU Executor 0.3.2 or newer and its advertised `advanceSamples` capability.
`run()` resolves after initialization. Samples are processed in order; the
next batch is requested after successful callback completion. Callback failure
stops the run. Cancellation/disposal aborts pending work and closes the session.
Check `context.signal.aborted` after awaiting before committing app side effects.
`onResultsComplete` follows the last successful sample callback.

`run()` keeps the provider app's existing fixed batch behavior by default: up to
256 samples per response, or one sample when `inputController` performs
per-sample feedback. A provider may set `maxBatchSamples` to cap that number, or
explicitly request `batchPolicy: 'adaptive'` to let the SDK adjust the next
`sim.advance` batch from FMU request response time and app processing/presentation
delay. The adaptive ceiling is the lower of `maxBatchSamples` and 2% of the configured
communication-step count, rounded down with a one-step minimum. It is based on
sample count, so the independent variable may use seconds, hours, or another
unit. Adaptive mode cannot be combined with `inputController`, because feedback
must run after every sample. If the app supplies `onBatchRendered`, the SDK waits
for it after `onSamples` and includes its delay in the adaptive measurement.
The app can resolve it after its Three.js renderer draws the batch's last sample.
Without that callback, the SDK measures app sample-processing time.

```js
client.run({ parameters, options, batchPolicy: 'adaptive', maxBatchSamples: 1 })
```

Input schedules are applied at model timestamps. An optional per-run
`inputController(sample, context)` returns runtime input updates, using one-step
batches for closed-loop feedback. Its throughput depends on network latency.

A ticket is sent only in the first `session.create` frame. Keep it in memory;
never place it in a URL, log, storage or app ZIP. Authorization, reservation
checks, quotas, revocation, expiry and SessionStarted evidence remain on the
provider's existing Gateway/issuer/Station paths.

See the [full contract](../../docs/provider/digital-twin-threejs-app-contract.md)
for startup, schema bounds, optional HMI and deployment details. The host
integration uses protocol version 2; the native WS session protocol is version
1.0.
Use `npm pack --workspace @decentralabs/digital-twin-app-protocol` to create a
tarball; this repository does not publish the npm package automatically.
