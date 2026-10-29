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

To configure a UI before running a simulation, an authorized direct session can
request `model.describe` with `{ includeVariables: true }` immediately after
connection, without `sim.initialize` or `sim.advance`; `session.capabilities`
contains the negotiated runtime features. Close the session when finished and
obtain a fresh one-use grant for a later session. Refresh the description when
the model, session or effective access policy changes; descriptors are filtered
by the Gateway and do not themselves prove write permission.

The current Gateway session runtime executes FMI 2/3 Co-Simulation. The
convenience runner requires FMU Executor 0.3.2 or newer and its advertised
`advanceSamples` capability. Direct session connections also require the
runtime to advertise its complete `inputUpdateQuota` capability.
`null` update-count or daily-byte limits mean the provider imposes no quota for
that dimension; payload and per-advance bounds remain advertised as positive
integers.
`run()` resolves after initialization. Samples are processed in order; the
next batch is requested after successful callback completion. Callback failure
stops the run. Cancellation/disposal aborts pending work and closes the session.
Check `context.signal.aborted` after awaiting before committing app side effects.
The SDK cannot forcibly stop application callback code: callbacks must observe
the abort signal and settle so asynchronous result finalization can complete.
`onResultsComplete` follows the last successful sample callback.
If both `onSamples` and `onSample` are supplied, only `onSamples` receives
samples, including the initial sample; otherwise `onSample` receives each one.

Set `includeModelVariables: true` to request the authorized variable descriptors
before initialization. The optional `validateModel(model)` callback can reject
an incompatible model by returning `false`; `parametersFromModel(model)` can
derive initialization values, with explicit `parameters` taking precedence.
The Gateway filters the descriptors according to the effective access policy.
A visible descriptor may be readable or writable, so its presence alone does not
establish permission to write: the Gateway remains the authority and can reject
an initialization or runtime write with `VARIABLE_ACCESS_DENIED`.

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
sliding window and maximum scheduled events and bytes per advance. The
high-level client splits large `inputSchedule` values to fit those limits,
tracks the applied event prefix, and retries schedule-bearing advances after
pre-execution `INPUT_UPDATE_RATE_LIMIT` responses. It paces individual
`sim.setInputs` calls as well. Daily quota errors remain visible to the app.
Input schedules are applied at model timestamps. An optional per-run
`inputController(sample, context)` returns runtime input updates for closed-loop
feedback; by default it receives every sample, or an app can set
`inputControllerInterval` and `inputControllerTimes` to wake at chosen model
times while the SDK advances in bounded batches. Its throughput depends on
network latency and the provider's published write quota.

Apps can pass `advanceOptions.outputSampleEverySteps` and
`advanceOptions.outputVariables` to request sparse, focused output while the
SDK manages the advance loop. `outputVariables` must contain 1–512 distinct
nonempty names, each at most 256 characters. The SDK snapshots this selection
at the start of `run()` and requests it for both the initial `sim.getOutputs`
and all subsequent `sim.advance` calls. Every selected value must be present in
the initial sample and every returned sample; missing values or an initial
time outside the SDK timeline tolerance stop the run with `INVALID_FMU_RESPONSE`.
The tolerance is `min(abs(stepSize)/4, max(1e-9 s, abs(stepSize)*1e-7,
8*Number.EPSILON*max(1, abs(startTime))))`: it accounts for floating-point
rounding at large start times without accepting an entire communication step.
Additional authorized outputs are accepted. With no explicit selection, the
SDK preserves the existing provider-default behavior and cannot infer which
outputs should have been returned. The high-level sample validator currently
accepts at most 512 scalar outputs per sample, each a finite number or boolean;
it does not handle FMI string or array outputs through this runner.

`outputSampleEverySteps` is an integer from 1 to 100,000: it controls output
sampling, independently of the FMI communication `stepSize`, maximum samples
per batch and replay speed. Samples retain their timestamps, sequence and event
flags, including multiple sequenced samples at the same timestamp. Scheduled-
input runs can also use adaptive batching:

```js
client.run({
  inputSchedule,
  batchPolicy: 'adaptive',
  advanceOptions: { outputSampleEverySteps: 500, outputVariables },
})
```

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
