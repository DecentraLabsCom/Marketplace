# @decentralabs/digital-twin-app-protocol

Browser-safe JavaScript, TypeScript declarations and JSON Schema for the
version 1 messaging contract between provider apps and Marketplace. The
package has no runtime dependencies and works in static, offline app bundles.
The SDK is optional: implementing the documented messages is sufficient.

## Two entry points

- `@decentralabs/digital-twin-app-protocol`: low-level message constants,
  validators, types and `postMessage` helpers used by Marketplace.
- `@decentralabs/digital-twin-app-protocol/client`: optional app-side client
  for startup, requests, result reception, acknowledgements and playback rate.

Once published, install the package in the app's build project with
`npm install @decentralabs/digital-twin-app-protocol`. This workspace does not
publish it automatically. Create a tarball before publication with
`npm pack --workspace @decentralabs/digital-twin-app-protocol`.

With a browser bundler, import the desired entry point and emit a self-contained
app. Without a bundler, copy `index.js` and, if needed, `client.js` into `sdk/`
inside the app ZIP. Keep them together so the client's relative import works:

```js
import { createDigitalTwinAppClient } from './sdk/client.js'

const twin = createDigitalTwinAppClient({
  onSample(sample) {
    // Also receives each batched sample if onSamples is not supplied.
    updateView(sample)
  },
  onResultsComplete({ state, sampleCount }) {
    finishReceivingResults(state, sampleCount)
  },
  onPlaybackRate(rate) {
    playback.setRate(rate)
  },
})

initializeScene()
  .then(() => twin.reportReady())
  .catch(() => twin.reportError('SCENE_INIT_FAILED'))

runButton.addEventListener('click', async () => {
  try {
    await twin.run({ parameters: readFmuInputs(), options: { stopTime: 60 } })
  } catch (error) {
    showRunError(error)
  }
})

window.addEventListener('pagehide', () => twin.dispose(), { once: true })
```

`run()` resolves on host acceptance, before computation and delivery finish.
`onSimulationState` describes computation. `onResultsComplete` runs after the
host's final delivery notification and all preceding sample callbacks.

For batch processing, provide `onSamples(samples, batch, context)` instead of
processing each entry through `onSample(sample, context)`. Either callback may
be asynchronous. Processing is ordered; acknowledgements follow successful
processing. Callback errors reach `onError` and stop that run's processing.

Both sample callback forms receive `context.signal`, aborted on reset, run
replacement or disposal. After awaiting work, check this signal before writing
to the scene or results. The client discards obsolete queued work and replies,
but cannot undo side effects inside an application callback.

All message shapes and bounds are in `schema-v1.json`. The
[full contract](../../docs/provider/digital-twin-threejs-app-contract.md)
documents sequencing, capabilities and direct message integration.
