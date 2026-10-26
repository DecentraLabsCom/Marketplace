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
`index.js`, `fmu-client.js`, `batch-controller.js`, `input-update-quota.js` and
`client.js` into a static ZIP's `sdk/` directory.
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
convenience runner requires FMU Executor 0.3.2 or newer and its advertised
`advanceSamples` capability. Direct session connections also require the
runtime to advertise its complete `inputUpdateQuota` capability.
`run()` resolves after initialization. Samples are processed in order; the
next batch is requested after successful callback completion. Callback failure
stops the run. Cancellation/disposal aborts pending work and closes the session.
Check `context.signal.aborted` after awaiting before committing app side effects.
`onResultsComplete` follows the last successful sample callback.

`run()` keeps the provider app's existing fixed batch behavior by default: up to
256 samples per response, or one sample when `inputController` performs
per-sample feedback. A provider may set `maxBatchSamples` to cap that number, or
explicitly request `batchPolicy: 'adaptive'` to let the SDK size each `sim.advance`
request from the model's measured per-sample compute cost, transport overhead,
payload size and an optional presentation acknowledgement. It does not change the
FMI step size, and its maximum batch is independent of the configured horizon.
The initial policy targets a 200 ms request cycle and a soft 50 ms Executor compute
budget, with a 50 ms presentation reserve when the app has not confirmed rendering.
Apps can tune these with `adaptiveBatchOptions`; `maxBatchSamples` and the Executor's
frame limit remain hard caps. The Executor checks the compute budget between FMI
steps, so a single slow `doStep()` can exceed it; the response reports the overrun.
Adaptive mode requires the session capabilities `advanceComputeBudget` and
`advanceSampleSequences`; fixed execution remains available without them.
Adaptive mode cannot be combined with `inputController`, because feedback must run
after every sample. If the app supplies `onBatchRendered`, the SDK waits for it
after `onSamples` and uses that acknowledgement as presentation telemetry. The app
can resolve it after its renderer draws the last sample. Without an acknowledgement,
presentation time stays unknown and the controller keeps its reserve rather than
treating the batch as instantly displayed.

Each returned sample may include a monotonically increasing `sequence` plus event,
event-handling, early-return and termination flags. The sequence preserves order when FMI reports
multiple meaningful states at the same model time. `sim.advance` also reports
`computeMs`, `sampleBytes`, `samplesReturned`, `stepsExecuted`, `stopReason`, and
`inputEventsApplied` so clients can distinguish response size, partial progress,
compute-budget returns and consumed scheduled inputs.

```js
client.run({ parameters, options, batchPolicy: 'adaptive', maxBatchSamples: 1 })
```

Session creation advertises the provider's input update quota, including its
sliding window and maximum scheduled events per advance. The high-level client
paces `sim.setInputs`; the direct WebSocket client retries input writes and
schedule-bearing `sim.advance` calls after pre-execution
`INPUT_UPDATE_RATE_LIMIT` responses with a valid `retryAfterMs`. Batch-size and
daily quota errors remain visible to the app. Input schedules are applied at
model timestamps. An optional per-run
`inputController(sample, context)` returns runtime input updates, using one-step
batches for closed-loop feedback. Its throughput depends on network latency
and the provider's published write quota.

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
