---
description: Marketplace postMessage contract for provider-supplied Three.js applications connected to FMU simulations.
---

# Three.js digital twin app contract

This document defines the version 1 browser messaging contract between a
provider's static Three.js application and Marketplace. It covers the app's
startup handshake, FMU run requests, streamed outputs and optional shared
playback control. For asset upload, AAS linking and Gateway delivery, see
[Configure and publish your lab](../become-a-provider/configure-and-publish-your-lab.md)
and the Lab Gateway AAS support documentation.

## Responsibilities

- The provider app supplies the complete visual experience: scene, normal
  input controls, run action, charts and other presentation.
- Marketplace hosts the app in a sandboxed iframe, validates run requests,
  executes the FMU through the lab's Gateway and streams model time and FMI
  outputs to the app.
- Marketplace does not load the app's FMU or pass it a reservation token,
  access key or other Gateway credential.
- Marketplace may show a generic input-schedule editor outside the iframe.
  Its events are applied to the next FMU run; scheduling is not an app message
  and the app does not need to implement that editor.
- An app may opt into Marketplace's shared playback-rate control. That control
  affects the app's visual playback only.

The app remains a complete experience inside its viewer area. Marketplace does
not wrap it in the GLB viewer or add the GLB viewer's output charts and table.

## Message rules

Every message is a JSON object with a string `type` and integer `version: 1`.
The app should register its `message` listener before loading the scene and
should only process host messages when `event.source === window.parent`.
Marketplace accepts app messages only from the selected iframe's
`contentWindow` and ignores messages with an unsupported version.

Marketplace uses an opaque-origin sandbox for the iframe. Consequently it
posts to the app with target origin `*`; this does not grant the app access to
Marketplace credentials or APIs.

The iframe sandbox allows scripts but does not allow form submission. Apps
must start FMU runs from an explicit button or other script-driven control;
they must not depend on an HTML form submit action.

## Startup handshake

After the iframe document loads, Marketplace sends the handshake immediately
and retries it every 500 ms until the app reports ready or the 30-second
startup timeout is reached:

```js
{
  type: 'decentralabs:digital-twin-host-ready',
  version: 1,
}
```

The app sends `decentralabs:digital-twin-ready` only after its scene and
interactive controls are ready. The app may include the optional `capabilities`
array. The only capability currently recognized is `playback-rate`:

```js
window.parent.postMessage({
  type: 'decentralabs:digital-twin-ready',
  version: 1,
  capabilities: ['playback-rate'],
}, '*')
```

If startup fails, the app may send
`decentralabs:digital-twin-error`, optionally with a short `code`. Marketplace
reports a startup failure and lets the user retry if the app did not become
ready before the timeout. The app should retain its startup result until it
has received the host-ready handshake, since the iframe can load before scene
initialization finishes.

## Requesting an FMU run

The app requests a run with `decentralabs:fmi-run-request`:

```js
window.parent.postMessage({
  type: 'decentralabs:fmi-run-request',
  version: 1,
  parameters: { robotSpeed: 0.7 },
  options: { startTime: 0, stopTime: 220, stepSize: 0.1 },
}, '*')
```

`parameters` is an object keyed by FMU variable name. Marketplace accepts FMU
inputs and non-constant tunable parameters, then validates names and values
against the selected model's FMI metadata. Send an empty object when there are
no values to override.

`options` is optional. It may contain finite numeric `startTime`, `stopTime`
and `stepSize`; each supplied field overrides that field in the current
Marketplace simulation settings, and omitted fields retain their current
values. The stop time must be greater than the start time and the step size
must be positive. For FMI Scheduled Execution, `stepSize` is not accepted.
These are simulation execution options, not FMU input variable names.

For example, if the app exposes only a duration control, it can send just the
selected stop time:

```js
window.parent.postMessage({
  type: 'decentralabs:fmi-run-request',
  version: 1,
  parameters,
  options: { stopTime: Number(durationInput.value) },
}, '*')
```

Marketplace combines the request with its current settings, validates it and
starts the FMU run. Invalid names, values or options produce a failed run;
the host reports its state as `error`.

## Receiving time and outputs

Marketplace sends only the FMU's declared output variables. Each sample has a
model `time` and an `outputs` object keyed by FMI output name. Values are
finite numbers or booleans when present.

When no result timeline exists, Marketplace sends the current/default output
state as `decentralabs:fmi-sample`. Its `time` may be `null` if no simulation
time is available:

```js
{
  type: 'decentralabs:fmi-sample',
  version: 1,
  time: null,
  outputs: { ordersCompleted: 0 },
}
```

During a run, Marketplace streams new timeline entries incrementally through
`decentralabs:fmi-samples`:

```js
{
  type: 'decentralabs:fmi-samples',
  version: 1,
  samples: [
    { time: 0, outputs: { ordersCompleted: 0 } },
    { time: 0.1, outputs: { ordersCompleted: 1 } },
  ],
}
```

When a new run replaces the timeline, Marketplace sends
`decentralabs:fmi-reset`; the app should clear its old replay data. Marketplace
also sends `decentralabs:fmi-simulation-state` with one of these values:

| State | Meaning |
| --- | --- |
| `idle` | No run is active and no completed timeline is available. |
| `running` | The FMU is executing and more samples may arrive. |
| `completed` | The run ended and the timeline is available for replay. |
| `error` | The run failed. |

Apps should use sample timestamps to animate the scene and must not assume a
fixed output interval. They should retain the timeline if they support replay.

## Optional playback-rate control

An app opts in by advertising `playback-rate` in its ready message. Marketplace
then sends `decentralabs:fmi-playback-control` whenever the selected rate
changes:

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
displayed model time. This setting does not alter FMU execution or its
calculated outputs. Apps that do not advertise the capability receive no
playback-control message and keep their own playback behavior.

## Message summary

| Message | Direction | Purpose |
| --- | --- | --- |
| `decentralabs:digital-twin-host-ready` | Marketplace → app | Startup handshake. |
| `decentralabs:digital-twin-ready` | App → Marketplace | Scene ready; may declare `playback-rate`. |
| `decentralabs:digital-twin-error` | App → Marketplace | Optional startup error with a short `code`. |
| `decentralabs:fmi-run-request` | App → Marketplace | Run request with FMU values and optional simulation options. |
| `decentralabs:fmi-sample` | Marketplace → app | Current/default sample when no timeline is available. |
| `decentralabs:fmi-samples` | Marketplace → app | Incremental timeline samples. |
| `decentralabs:fmi-reset` | Marketplace → app | Previous timeline has been replaced. |
| `decentralabs:fmi-simulation-state` | Marketplace → app | Run lifecycle state. |
| `decentralabs:fmi-playback-control` | Marketplace → app | Optional visual playback rate. |

Last reviewed: 2026-10-23
