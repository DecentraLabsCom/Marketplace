# @decentralabs/digital-twin-app-protocol

Optional browser clients and schemas for provider web apps. Finite, fastest
batch runs use Marketplace's authenticated HTTP/NDJSON stream; interactive,
continuous and open-ended runs use the reservation-ticket WebSocket directly
between the app and provider Gateway. Marketplace credentials and session
cookies remain in the host page and are never exposed to the app iframe.

## Entry points

* Package root: host integration **v2** constants, validators and TypeScript types.
* `/fmu-client`: `connectFmuSession(grant)`, a direct Gateway WebSocket client with no
  dependency on Marketplace or a parent window.
* `/client`: `createDigitalTwinAppClient()`, composing direct execution with
  optional Marketplace startup, authorization and visualization integration.
  Eligible hosted finite runs are routed through the parent-owned HTTP stream;
  interactive runs retain the direct WebSocket session.
* `/simulation-stream`: shared NDJSON decoding and event normalization used by
  the SDK host bridge and the generated GLB runner. Sample batches use an
  acknowledgement before the host reads the next part of the HTTP stream.
* `/schema-v2`: the JSON Schema for the host messages.

There are no runtime dependencies. Bundle the desired entry, or copy
`index.js`, `fmu-client.js`, `parameter-defaults.js`, `batch-controller.js`,
`simulation-stream.js`, `input-update-quota.js` and `client.js` into a static ZIP's `sdk/` directory.
If the app also exports scenes, copy `scene-presentation.js` into that directory
too. The package does not register modules or impose an SDK requirement on
providers.

```js
import { createDigitalTwinAppClient } from './sdk/client.js'
const app = createDigitalTwinAppClient({
  executionPaceControl: true,
  defaultExecutionPace: 'realtime',
  onFmiLsParameterPreset(preset) { applyParametersToControls(preset.parameters) },
  onSamples(samples) { timeline.append(samples) },
  onReset() { timeline.clear() },
  onResultsComplete({ state }) { showResult(state) },
  onPlaybackRate(rate) { replay.setRate(rate) },
})
initializeView().then(() => app.reportReady())
// Omit stopTime to keep the FMU running until the app cancels it or the provider/runtime ends the session. Pass a finite stopTime for a bounded run.
runButton.onclick = () => app.run({ parameters: readInputs() }).catch(showError)
window.addEventListener('pagehide', () => app.dispose(), { once: true })
```

## Client lifecycle and schedule composition

`reportReady()` completes the host handshake after the app scene can receive
messages; `reportError(code)` reports a bounded startup failure. The client
also exposes `cancel()`, `dispose()`, `captureState()` and
`requestModelChange(modelId)`. `onSimulationState`, `onRunAccepted`,
`onRunRejected`, `onRunCancelled`, `onResultsComplete` and `onError` cover run
status and completion. `onRunAccepted` fires after connection, initialization
and the initial output sample succeed; `onRunRejected` reports a run that fails
before acceptance. `onHostReady` receives any explicitly configured host
extensions.

`run({ inputSchedule })` supplies the app's effective schedule. To add
app-specific events while preserving a schedule authorized by Marketplace,
use `composeInputSchedule(providerSchedule)` instead; it receives a copy of the
host schedule and must return the complete schedule to apply. These two options
are mutually exclusive. The returned events still pass SDK validation and
Gateway write-permission and quota checks.

`requestModelChange(modelId)` only asks the parent host to change models through
the optional `decentralabs:digital-twin-model-change` extension. It has no
effect unless the host explicitly supports and authorizes that extension; the
standard published-lab flow remains bound to its configured FMU.

An app that supplies `onFmiLsParameterPreset` advertises the optional
`fmi-ls-parameter-presets` capability. Marketplace then shows the FMU's
FMI-LS-REF parameter sets in a host-owned selector and sends the selected
`{ id, name, description, parameters }` to the app. The app applies the values
to its controls; the parameter sets remain sourced from the FMU.

The SDK advertises `fmi-ls-experiments` and accepts the host's
`decentralabs:fmi-ls-experiment` selection message. When the reservation has a
supported, authorized FMI-LS-REF experiment, Marketplace shows it in the
floating controls menu. Until cleared, the selected parameter set replaces
app-supplied run parameters, while declared simulation options override the
matching `run()` options. FMU defaults apply to variables not listed in the
experiment. An optional `onFmiLsExperiment(experiment)` callback lets an app
also reflect the selection in its own controls; it receives `null` when
cleared.

Apps may opt in to the Marketplace **Pace** selector with
`executionPaceControl: true`. The app can choose `defaultExecutionPace` and
optionally observe each effective run pace with `onExecutionPace`. The host
returns the user's selection with the next connection grant; the SDK then
applies it to that run. **Real time (1x)** paces advances to the wall clock and
groups due output samples using its adaptive batch controller. If the FMU,
callbacks or connection cannot keep up, simulation time falls behind the clock
without skipping steps. **Fastest** follows the app's configured batching. `batchPolicy`,
`maxBatchSamples` and `adaptiveBatchOptions` stay in the app's `run()` call and
are not presented as end-user controls. A run-level `executionPace` is also
available for standalone clients; a Marketplace selection takes precedence.

The SDK also advertises `fmu-state-checkpoints`. When the authorized Gateway
reports that the FMU supports both Get/Set and serialized state, the shared
Digital Twin controls menu can save, load, and clear a checkpoint. Load also
refreshes the app's visible scene from the saved output sample when available.
After an SDK run completes, the SDK retains its FMU session for up
to five minutes so Save can capture the actual final FMU state. This is separate
from visual replay: pausing replay does not move the FMU back to the selected
sample. The saved bundle includes the latest selected FMU outputs and the model
input and parameter values at the checkpoint when they fit within the checkpoint
size limit. `Load` updates named form controls (`name` equal to the FMI variable
name) whenever `modelValues` are present. When the saved bundle also contains
an output sample, `onFmuStateLoaded(sample, context)` receives it together with
`context.modelValues` for apps with custom controls; this callback is not called
when the bundle has no sample. The next run still restores the actual serialized
FMU state. A provider app can also use
`run({ checkpoint, captureFmuStateOnComplete: true })`, receive the resulting
bundle through `onFmuStateCheckpoint`, or call `captureState()` during an active
run or within five minutes of completion. The direct session API exposes
`session.captureState()` and
`session.restoreState(checkpoint)` for apps that manage their own controls.
Checkpoints are opaque, reservation-bound references to Executor-side state;
Marketplace keeps the reference in the current page session scoped to the lab
and reservation. Reloading the page discards the reference; the remote snapshot
expires after 24 hours and can only be restored for the same FMU and
execution platform. They are available only when the source FMU declares the
FMI state and serialization capabilities and the Gateway runtime is configured
to sign checkpoint references. Simulation stop time remains absolute: to
continue for eight seconds from a checkpoint at t=8 s, use stop time t=16 s.

For standalone use, supply a `getConnection({ options, signal })` callback
returning a connection grant from your own authorized backend. It may return a
connection directly or `{ connection, inputSchedule, executionPace }` when that
backend provides an authorized schedule or execution-pace selection. For direct FMI
session operations without the host client:

```js
import { connectFmuSession } from './sdk/fmu-client.js'
const session = await connectFmuSession(grant, { signal })
const model = await session.request('model.describe', 'model.description', { includeVariables: true })
await session.request('sim.initialize', 'sim.state', { parameters, options })
const batch = await session.request('sim.advance', 'sim.samples', { targetTime: 60, maxSamples: 256 })
session.close()
```

To configure a UI before running a simulation, an authorized direct session can
request `model.describe` immediately after connection, without `sim.initialize`
or `sim.advance`; `session.capabilities` contains the negotiated runtime
features. A direct `sim.initialize` with parameters automatically fetches the
descriptors first if the app has not requested them. Close the session when
finished and obtain a fresh one-use grant for a later session. Refresh the
description when the model, session or effective access policy changes;
descriptors are filtered by the Gateway and do not themselves prove write
permission.

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

When embedded in Marketplace, a finite run using **Fastest** Pace, fixed
batching, and no input-controller, model-validation or parameter-derivation
callbacks can use the parent-owned POST/NDJSON stream. The Marketplace host
makes the authenticated
request, relays bounded sample batches and waits for the SDK acknowledgement
before reading further. Requested output variables and sample stride are
forwarded as simulation options so Gateway and Executor can apply them before
returning samples. Adaptive, continuous, step-by-step, real-time, open-ended
and model-feedback runs continue over the direct Gateway WebSocket. Standalone
use with `getConnection` is unchanged.

Before initialization, the SDK requests the authorized variable descriptors and
omits any supplied value that exactly matches that variable's declared FMI
`start`. Descriptors without a visible `start` remain untouched. The optional
`validateModel(model)` callback can reject an incompatible model by returning
`false`; `parametersFromModel(model)` can derive initialization values, with
explicit `parameters` taking precedence. The Gateway filters descriptors
according to the effective access policy. A visible descriptor may be readable
or writable, so its presence alone does not establish permission to write: the
Gateway remains the authority and can reject an initialization or runtime write
with `VARIABLE_ACCESS_DENIED`.

`run()` uses adaptive batching by default for **Realtime** Pace and fixed batches
for **Fastest** Pace. Fixed mode requests up to 256 samples per response. Adaptive
mode sizes each `sim.advance` request from measured per-sample compute cost,
transport overhead, payload size and an optional presentation acknowledgement.
It does not change the FMI step size, and its maximum batch is independent of
the configured horizon. Set `batchPolicy` explicitly when the app needs a
different strategy; `maxBatchSamples` caps either strategy.
The initial policy targets a 200 ms request cycle and a soft 50 ms Executor compute
budget, with a 50 ms presentation reserve when the app has not confirmed rendering.
Apps can tune these with `adaptiveBatchOptions`; `maxBatchSamples` and the Executor's
frame limit remain hard caps. `model.description` responses have a separate 32 MiB
ceiling for FMUs with large variable inventories; other response frames retain the
1,000,000-byte limit. The Executor checks the compute budget between FMI
steps, so a single slow `doStep()` can exceed it; the response reports the overrun.
Adaptive mode requires the session capabilities `advanceComputeBudget` and
`advanceSampleSequences`; fixed execution remains available without them.
An `inputController` without an interval or scheduled times receives every
sample and therefore uses one-sample advances. With the default policy, a
Realtime run automatically keeps that per-sample feedback behavior; explicitly
requesting adaptive batching with such a controller is rejected. Controllers
with `inputControllerInterval` or `inputControllerTimes` can use adaptive batches;
the SDK ends each batch at the next controller time so feedback is applied at
the requested boundary. If the app supplies `onBatchRendered`, the SDK waits for it
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
network latency and the provider's published write quota. Controller updates are
included in the next `sim.advance` when the runtime advertises
`advanceInputValues`; otherwise the SDK sends `sim.setInputs` immediately before
that advance. Both paths obey the same write permissions and provider quotas.

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

## Three.js / GLB presentation parity

Use the active Three.js scene, camera, renderer, and OrbitControls state as the
source of truth. The shared exporter captures those settings into the versioned
`decentralabsScenePresentation` profile and stores it as glTF scene extras. The
profile includes camera and controls, background and fog, renderer color space,
tone mapping, exposure, pixel ratio, clear color, shadow-map configuration,
ambient lights, and any ambient-light direction glTF cannot represent. Its JSON
Schema is available at `./scene-presentation-schema`.

```js
import { exportSceneWithPresentation } from './sdk/scene-presentation.js'
import { GLTFExporter } from './vendor/GLTFExporter.js'

const glb = await exportSceneWithPresentation({
  THREE,
  scene,
  camera,
  renderer,
  controls,
  surfaceElement: document.querySelector('.scene-card'),
  exporter: new GLTFExporter(),
  options: { binary: true },
})
```

The exporter includes hidden geometry and records each object's visibility and
shadow state. It preserves material render flags glTF omits, exports ambient
lights through the profile, converts `LineBasicMaterial` to glTF unlit
semantics, and restores the source scene after export. Directional and spot
light aim is encoded from each Three.js target. The exporter snapshots matrix
arrays before restoring temporary aim changes, preserving the caller's matrix
or TRS representation. The Marketplace viewer applies the same profile and
material state, then uses punctual lights and PBR materials carried by glTF. It
does not add a studio rig when the source has authored lighting. Apps without a
valid profile use the generic studio path.

GLBs must be generated with the shared exporter so their shadow map, lights,
shadow cameras, and per-object cast/receive flags come from the original canvas.
The viewer applies that captured state without inferring defaults for older
assets; regenerate an asset when it predates this metadata.

Parity covers the Three.js canvas. HTML HUDs and CSS layers over the canvas are
not part of the exported scene; remove visual effects that alter the canvas
before export. If `surfaceElement` is supplied, marking such a layer with
`data-decentralabs-scene-overlay` makes export fail instead of silently
dropping it. Custom shaders, non-normal blending, custom environment textures,
orthographic cameras, post-processing passes, and features outside glTF's
portable material/geometry model need an explicit supported representation
before export. Compare at the same viewport aspect ratio for pixel-level checks.
