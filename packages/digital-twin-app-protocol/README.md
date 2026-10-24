# @decentralabs/digital-twin-app-protocol

The browser-safe JavaScript SDK and JSON Schema for Marketplace's version 1
Three.js digital twin messaging protocol. Marketplace and the Smart Warehouse
example use this same package source. The package has no runtime dependencies
and works in a static, offline app bundle.

## Install and use

Once the package is published, install it in the app's build project:

```sh
npm install @decentralabs/digital-twin-app-protocol
```

Apps served as static ZIPs must bundle the SDK module beside the importing
module. With a browser bundler, import the SDK from the package and emit a
self-contained app. For a no-bundler app, copy `index.js` into the ZIP as
`digitalTwinAppProtocol.js` and import it with a relative URL.

```js
import {
  DIGITAL_TWIN_MESSAGE,
  isHostMessageEvent,
  postToHost,
  acknowledgeSampleBatch,
} from '@decentralabs/digital-twin-app-protocol'

window.addEventListener('message', (event) => {
  if (!isHostMessageEvent(event)) return
  if (event.data.type === DIGITAL_TWIN_MESSAGE.HOST_READY) {
    postToHost(DIGITAL_TWIN_MESSAGE.APP_READY, {
      capabilities: ['sample-acknowledgement'],
    })
  }
  if (event.data.type === DIGITAL_TWIN_MESSAGE.SAMPLES) {
    // Append the batch to the app's replay timeline before acknowledging it.
    acknowledgeSampleBatch(event.data)
  }
})
```

All message types and limits are in `schema-v1.json`. Structural validation is
available through `isValidAppMessage` and `isValidHostMessage`; Marketplace
also validates run parameter names and values against the selected FMU's
metadata. Apps should ignore messages from any source other than
`window.parent`.

The Marketplace repository keeps a documentation copy of the schema. Its
protocol conformance test asserts that the copy matches this package schema
and checks representative messages against both the schema and SDK validators.

## Workspace package

The SDK source is versioned in Marketplace under `packages/`. To create a local
tarball for an app builder before publication:

```sh
npm pack --workspace @decentralabs/digital-twin-app-protocol
```

This workspace does not publish the package automatically.
