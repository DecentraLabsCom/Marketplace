---
description: Marketplace postMessage contract for provider-supplied Three.js applications connected to FMU simulations.
---

# Three.js digital twin app contract

This document defines the version 1 browser messaging contract between a
provider's static Three.js application and Marketplace. The accompanying
[JSON Schema](digital-twin-threejs-app-contract.schema.json) is the
machine-readable message reference. Marketplace's protocol helpers live in
`src/components/simulation/digitalTwinAppProtocol.js`; the maintained FMU
example builders include that module in their offline app bundles.

For asset upload, AAS linking and Gateway delivery, see
[Configure and publish your lab](../become-a-provider/configure-and-publish-your-lab.md)
and the Lab Gateway AAS support documentation.

## Responsibilities and trust boundary

- The provider app supplies the complete visual experience: scene, normal
  input controls, run action, charts and other presentation.
- Marketplace hosts the app in a sandboxed iframe, validates run requests,
  executes the FMU through the lab's Gateway and streams declared model outputs.
- Marketplace does not load the app's FMU or pass it a reservation token,
  access key or other Gateway credential.
- Marketplace may show a generic input-schedule editor outside the iframe.
  Its events are applied to the next FMU run; scheduling is not an app message.
- An app may opt into Marketplace's shared playback-rate control. It affects
  visual playback only and does not change FMU execution.

The app remains a complete experience inside its viewer area. Marketplace does
not wrap it in the GLB viewer or add the GLB viewer's output charts and table.

The iframe uses `sandbox="allow-scripts"` and a unique opaque origin. The host
checks the app's `postMessage` source against the selected iframe's
`contentWindow`; apps must check that `event.source === window.parent`. Since
the iframe has an opaque origin, host-to-app messages use target origin `*`.
The host accepts only version 1 messages and validates the shape and bounds of
run requests, acknowledgements and advertised capabilities.

## Envelope, identifiers and limits

Every message is a JSON object with a string `type` and integer `version: 1`.
Message names are namespaced with `decentralabs:`. Identifiers are opaque
strings up to 128 characters. A `requestId` identifies one app request; a
`runId` identifies the accepted execution and its output stream; `batchId`
identifies one bounded output batch.

Limits in the current contract:

- At most 256 FMU parameters per run request.
- Parameter names are at most 256 characters. Values are finite numbers,
  booleans or strings up to 1,024 characters.
- Run options are finite `startTime`, `stopTime` and `stepSize` numbers only.
  Model metadata and execution type apply the additional FMU-specific checks.
- At most 256 samples and 512 outputs per sample. A serialized
  `fmi-samples` message is also capped at 1,000,000 JavaScript characters.
  Sample output values are finite numbers or booleans.
- Apps that advertise `sample-acknowledgement` must acknowledge each output
  batch within 15 seconds. The host keeps at most one unacknowledged batch in
  flight for that app.

The schema is normative for message shape and field-level bounds. Runtime
validation also enforces the serialized batch cap, source window and selected
model's FMI metadata.

## Versioning and extension rules

Version 1 messages have closed field sets. Unknown message types are ignored,
and unknown capabilities are ignored. Apps should use documented capabilities
for optional shared behavior and namespaced `extensions` for app-specific
host-ready data; they should not add undocumented top-level fields. A change
that makes a version 1 message shape incompatible requires a new protocol
version and coordinated host/app support.

## Startup handshake

After the iframe document loads, Marketplace sends this message and retries it
every 500 ms until the app reports ready or the 30-second startup timeout is
reached:

```js
{
  type: 'decentralabs:digital-twin-host-ready',
  version: 1,
}
```

The app registers its `message` listener before loading the scene, ignores
messages unless they come from `window.parent`, and reports ready only after
its scene and interactive controls work:

```js
window.parent.postMessage({
  type: 'decentralabs:digital-twin-ready',
  version: 1,
  capabilities: ['playback-rate', 'sample-acknowledgement'],
  playbackControlPosition: 'bottom-right',
}, '*')
```

Recognized capabilities are:

| Capability | Effect |
| --- | --- |
| `playback-rate` | Shows Marketplace's floating playback control and sends `fmi-playback-control`. |
| `sample-acknowledgement` | Enables one-batch-at-a-time delivery; the app acknowledges after accepting a batch. |

Unknown capabilities are ignored. `playbackControlPosition` is optional and
may be `top-left`, `top-right`, `bottom-left` or `bottom-right`. Apps that do
not advertise a position use the Marketplace default.

If startup fails, the app may send `decentralabs:digital-twin-error` with an
optional short `code`. Marketplace reports the startup failure and lets the
user retry. The app should retain its startup result until it receives the
host-ready handshake, since the iframe can load before scene initialization
finishes.

## Requesting and cancelling an FMU run

The app asks Marketplace to run the FMU with `decentralabs:fmi-run-request`:

```js
window.parent.postMessage({
  type: 'decentralabs:fmi-run-request',
  version: 1,
  requestId: 'request:unique-id',
  parameters: { robotSpeed: 0.7 },
  options: { startTime: 0, stopTime: 220, stepSize: 0.1 },
}, '*')
```

`requestId` is recommended and is included in the host's response. It is
optional for apps using the original v1 request shape. `parameters` is keyed
by FMI variable name. Marketplace accepts inputs and non-constant tunable
parameters, then validates each name and value against the selected model's
FMI metadata. Send an empty object when there are no overrides.

`options` is optional. Omitted fields keep the current Marketplace settings.
The stop time must be greater than the start time and the step size positive.
For FMI Scheduled Execution, `stepSize` is not accepted. Options describe FMU
execution and are not variable names.

Marketplace responds with `decentralabs:fmi-run-accepted` and a `runId` when
it accepts the request, or `decentralabs:fmi-run-rejected` with a short `code`
when the message is invalid or a run is already active. Accepted requests may
still fail later during model validation or execution; the terminal
`fmi-simulation-state` then reports `error` for that `runId`.

An app may request cancellation for its active run:

```js
window.parent.postMessage({
  type: 'decentralabs:fmi-run-cancel',
  version: 1,
  runId: 'run:unique-id',
}, '*')
```

Marketplace ignores cancellation requests for a different or finished run.
For the active run, it aborts the Marketplace stream request, propagates that
abort to the Gateway request and reports `cancelled` for the matching `runId`.
Already delivered samples remain available for inspection. Cancellation is
scoped to the active stream; it does not expose a separate Gateway credential
or cancellation endpoint to the app.

## Receiving time and outputs

Marketplace sends only the FMU's declared output variables. Each sample has a
model `time` and an `outputs` object keyed by FMI output name. Values are
finite numbers or booleans when present. When no timeline exists, the host
sends the current/default output state as `decentralabs:fmi-sample`; its `time`
may be `null`:

```js
{
  type: 'decentralabs:fmi-sample',
  version: 1,
  runId: 'run:unique-id',
  time: null,
  outputs: { ordersCompleted: 0 },
}
```

Incremental timeline entries arrive as bounded `decentralabs:fmi-samples`
batches. `runId`, `batchId`, `firstSampleIndex` and `lastSampleIndex` are
present when the app advertises sample acknowledgement:

```js
{
  type: 'decentralabs:fmi-samples',
  version: 1,
  runId: 'run:unique-id',
  batchId: 'batch:unique-id',
  firstSampleIndex: 0,
  lastSampleIndex: 1,
  samples: [
    { time: 0, outputs: { ordersCompleted: 0 } },
    { time: 0.1, outputs: { ordersCompleted: 1 } },
  ],
}
```

After the app has appended the batch to its replay data, it acknowledges the
last sample index:

```js
window.parent.postMessage({
  type: 'decentralabs:fmi-samples-ack',
  version: 1,
  runId: 'run:unique-id',
  batchId: 'batch:unique-id',
  lastSampleIndex: 1,
}, '*')
```

The host sends the next batch only after the matching acknowledgement. A stale
or mismatched acknowledgement is ignored. If an app does not advertise the
capability, the host still sends batches no larger than 256 samples but does
not wait for an acknowledgement. Older v1 apps may ignore the optional run
and batch fields and continue receiving the existing sample messages.

For acknowledgement-enabled batches, `runId`, `batchId`, `firstSampleIndex` and
`lastSampleIndex` are all required. Indices are zero-based and consecutive:
`lastSampleIndex` must equal `firstSampleIndex + samples.length - 1`.

When a new run replaces the timeline, Marketplace sends
`decentralabs:fmi-reset` with the new `runId`; the app clears old replay data
and associates subsequent samples and state with that run. The host sends
`decentralabs:fmi-simulation-state` with one of these values:

| State | Meaning |
| --- | --- |
| `idle` | No run is active and no completed timeline is available. |
| `running` | The FMU is executing and more samples may arrive. |
| `completed` | The run ended and the timeline is available for replay. |
| `cancelled` | The active stream was aborted; already delivered samples remain available. |
| `error` | The run failed. |

Apps should ignore messages with a `runId` that does not match their active
run, use sample timestamps instead of assuming a fixed interval and retain
the timeline if they support replay.

## Optional playback-rate control

An app opts in by advertising `playback-rate`. Marketplace then sends
`decentralabs:fmi-playback-control` when the selected rate changes:

```js
{
  type: 'decentralabs:fmi-playback-control',
  version: 1,
  rate: 2,
  rateUnit: 'model-seconds-per-real-second',
}
```

`rate` is positive and means model seconds advanced per real second. The app
should multiply elapsed wall-clock time by this rate when advancing its
displayed model time. This does not alter FMU execution or calculated outputs.

## Extensions

Generic integrations should use the documented message types and capabilities.
Host-ready messages may include an `extensions` object for explicitly
namespaced app-specific data. Such fields are not interpreted by other apps.
The qFMU learning lab uses `extensions.qfmu.enableModelSelection` in the
host-ready message and sends `decentralabs:digital-twin-model-change` when its
selected model changes. These are qFMU-specific extensions, not Three.js
capabilities.

## Message summary

| Message | Direction | Purpose |
| --- | --- | --- |
| `decentralabs:digital-twin-host-ready` | Marketplace → app | Startup handshake; may carry namespaced `extensions`. |
| `decentralabs:digital-twin-ready` | App → Marketplace | Scene ready; may declare capabilities and playback-control position. |
| `decentralabs:digital-twin-error` | App → Marketplace | Startup error with optional short code. |
| `decentralabs:fmi-run-request` | App → Marketplace | Request a validated FMU run. |
| `decentralabs:fmi-run-accepted` | Marketplace → app | Request accepted and assigned a `runId`. |
| `decentralabs:fmi-run-rejected` | Marketplace → app | Request rejected with a short code. |
| `decentralabs:fmi-run-cancel` | App → Marketplace | Cancel the matching active run stream. |
| `decentralabs:fmi-run-cancelled` | Marketplace → app | Cancellation accepted for the matching run. |
| `decentralabs:fmi-sample` | Marketplace → app | Current/default output sample when no timeline is available. |
| `decentralabs:fmi-samples` | Marketplace → app | Incremental output samples, bounded to 256 per message. |
| `decentralabs:fmi-samples-ack` | App → Marketplace | Acknowledge a processed sample batch. |
| `decentralabs:fmi-reset` | Marketplace → app | Previous timeline has been replaced. |
| `decentralabs:fmi-simulation-state` | Marketplace → app | Run lifecycle state. |
| `decentralabs:fmi-playback-control` | Marketplace → app | Optional visual playback rate. |
| `decentralabs:digital-twin-model-change` | qFMU extension → Marketplace | Request the qFMU learning lab to select a different model. |

Last reviewed: 2026-10-24
