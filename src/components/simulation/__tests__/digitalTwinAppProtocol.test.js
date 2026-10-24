import Ajv2020 from 'ajv/dist/2020.js'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import {
  APP_TO_HOST_MESSAGE_TYPES,
  DIGITAL_TWIN_APP_ASSET_FILENAME,
  DIGITAL_TWIN_MESSAGE,
  DIGITAL_TWIN_PROTOCOL_VERSION,
  HOST_TO_APP_MESSAGE_TYPES,
  isValidAppMessage,
  isValidHostMessage,
  MAX_OUTPUTS_PER_SAMPLE,
  MAX_PARAMETER_NAME_LENGTH,
  MAX_PARAMETER_STRING_LENGTH,
  MAX_RUN_PARAMETERS,
  MAX_SAMPLES_PER_BATCH,
  MAX_SAMPLE_BATCH_JSON_CHARS,
} from '@decentralabs/digital-twin-app-protocol'

const schemaPath = path.join(process.cwd(), 'packages/digital-twin-app-protocol/schema-v1.json')
const packagePath = path.join(process.cwd(), 'packages/digital-twin-app-protocol/package.json')
const documentationSchemaPath = path.join(process.cwd(), 'docs/provider/digital-twin-threejs-app-contract.schema.json')
const schema = JSON.parse(readFileSync(schemaPath, 'utf8'))
const sdkPackage = JSON.parse(readFileSync(packagePath, 'utf8'))
const documentationSchema = JSON.parse(readFileSync(documentationSchemaPath, 'utf8'))
const validateSchema = new Ajv2020({ allErrors: true, strict: false }).compile(schema)

const validMessages = [
  {
    direction: 'host',
    value: { type: DIGITAL_TWIN_MESSAGE.HOST_READY, version: 1 },
  },
  {
    direction: 'app',
    value: {
      type: DIGITAL_TWIN_MESSAGE.APP_READY,
      version: 1,
      capabilities: ['playback-rate', 'sample-acknowledgement'],
      playbackControlPosition: 'bottom-right',
    },
  },
  {
    direction: 'app',
    value: { type: DIGITAL_TWIN_MESSAGE.APP_ERROR, version: 1, code: 'SCENE_FAILED' },
  },
  {
    direction: 'app',
    value: { type: DIGITAL_TWIN_MESSAGE.RUN_REQUEST, version: 1, requestId: 'request:1', parameters: { input: 2 } },
  },
  {
    direction: 'host',
    value: { type: DIGITAL_TWIN_MESSAGE.RUN_ACCEPTED, version: 1, requestId: 'request:1', runId: 'run:1' },
  },
  {
    direction: 'host',
    value: { type: DIGITAL_TWIN_MESSAGE.RUN_REJECTED, version: 1, requestId: 'request:1', code: 'INVALID_REQUEST' },
  },
  {
    direction: 'app',
    value: { type: DIGITAL_TWIN_MESSAGE.RUN_CANCEL, version: 1, runId: 'run:1' },
  },
  {
    direction: 'host',
    value: { type: DIGITAL_TWIN_MESSAGE.RUN_CANCELLED, version: 1, runId: 'run:1' },
  },
  {
    direction: 'host',
    value: { type: DIGITAL_TWIN_MESSAGE.SAMPLE, version: 1, runId: 'run:1', time: null, outputs: { ready: true } },
  },
  {
    direction: 'host',
    value: {
      type: DIGITAL_TWIN_MESSAGE.SAMPLES,
      version: 1,
      runId: 'run:1',
      batchId: 'batch:1',
      firstSampleIndex: 0,
      lastSampleIndex: 0,
      samples: [{ time: 0, outputs: { temperature: 21.5 } }],
    },
  },
  {
    direction: 'app',
    value: { type: DIGITAL_TWIN_MESSAGE.SAMPLES_ACK, version: 1, runId: 'run:1', batchId: 'batch:1', lastSampleIndex: 0 },
  },
  {
    direction: 'host',
    value: { type: DIGITAL_TWIN_MESSAGE.RESET, version: 1, runId: null },
  },
  {
    direction: 'host',
    value: { type: DIGITAL_TWIN_MESSAGE.SIMULATION_STATE, version: 1, runId: 'run:1', state: 'completed' },
  },
  {
    direction: 'host',
    value: { type: DIGITAL_TWIN_MESSAGE.RESULTS_COMPLETE, version: 1, runId: 'run:1', sampleCount: 2, state: 'completed' },
  },
  {
    direction: 'host',
    value: { type: DIGITAL_TWIN_MESSAGE.PLAYBACK_CONTROL, version: 1, rate: 2, rateUnit: 'model-seconds-per-real-second' },
  },
  {
    direction: 'app',
    value: { type: DIGITAL_TWIN_MESSAGE.MODEL_CHANGE, version: 1, modelId: 'first-order' },
  },
]

describe('digital twin protocol SDK', () => {
  test('keeps the SDK message inventory and documentation schema in sync', () => {
    const schemaMessageTypes = schema.oneOf
      .map(({ $ref }) => $ref.split('/').at(-1))
      .map((definition) => schema.$defs[definition].properties.type.const)
      .sort()

    expect([...Object.values(DIGITAL_TWIN_MESSAGE)].sort()).toEqual(schemaMessageTypes)
    expect([...APP_TO_HOST_MESSAGE_TYPES, ...HOST_TO_APP_MESSAGE_TYPES].sort()).toEqual(schemaMessageTypes)
    expect(documentationSchema).toEqual(schema)
  })

  test('keeps package metadata, schema limits and runtime constants aligned', () => {
    expect(sdkPackage.browserBundleFile).toBe(DIGITAL_TWIN_APP_ASSET_FILENAME)
    expect(schema.$defs.base.properties.version.const).toBe(DIGITAL_TWIN_PROTOCOL_VERSION)
    expect(schema.$defs.runRequest.properties.parameters.maxProperties).toBe(MAX_RUN_PARAMETERS)
    expect(schema.$defs.runRequest.properties.parameters.propertyNames.maxLength).toBe(MAX_PARAMETER_NAME_LENGTH)
    expect(schema.$defs.scalar.oneOf.find((entry) => entry.type === 'string').maxLength).toBe(MAX_PARAMETER_STRING_LENGTH)
    expect(schema.$defs.outputs.maxProperties).toBe(MAX_OUTPUTS_PER_SAMPLE)
    expect(schema.$defs.samples.properties.samples.maxItems).toBe(MAX_SAMPLES_PER_BATCH)
  })

  test.each(validMessages)('$direction message $value.type passes the schema and SDK validators', ({ direction, value }) => {
    expect(validateSchema(value)).toBe(true)
    expect(direction === 'app' ? isValidAppMessage(value) : isValidHostMessage(value)).toBe(true)
  })

  test.each([
    [{ type: DIGITAL_TWIN_MESSAGE.APP_READY, version: 2 }, 'app'],
    [{ type: DIGITAL_TWIN_MESSAGE.APP_READY, version: 1, unsupported: true }, 'app'],
    [{ type: DIGITAL_TWIN_MESSAGE.APP_READY, version: 1, capabilities: ['playback-rate', 'playback-rate'] }, 'app'],
    [{ type: DIGITAL_TWIN_MESSAGE.SAMPLES_ACK, version: 1, runId: 'run:1', batchId: 'batch:1', lastSampleIndex: -1 }, 'app'],
    [{ type: DIGITAL_TWIN_MESSAGE.PLAYBACK_CONTROL, version: 1, rate: 0, rateUnit: 'model-seconds-per-real-second' }, 'host'],
    [{ type: DIGITAL_TWIN_MESSAGE.RESULTS_COMPLETE, version: 1, sampleCount: -1, state: 'completed' }, 'host'],
    [{ type: DIGITAL_TWIN_MESSAGE.RESULTS_COMPLETE, version: 1, sampleCount: 2, state: 'running' }, 'host'],
  ])('rejects malformed messages through both the schema and SDK validators', (message, direction) => {
    expect(validateSchema(message)).toBe(false)
    expect(direction === 'app' ? isValidAppMessage(message) : isValidHostMessage(message)).toBe(false)
  })

  test('rejects non-finite JavaScript numbers that cannot be represented in JSON', () => {
    const invalidMessages = [
      { type: DIGITAL_TWIN_MESSAGE.RUN_REQUEST, version: 1, options: { stepSize: Infinity } },
      { type: DIGITAL_TWIN_MESSAGE.SAMPLE, version: 1, time: 0, outputs: { temperature: NaN } },
    ]

    for (const message of invalidMessages) {
      expect(isValidAppMessage(message) || isValidHostMessage(message)).toBe(false)
      expect(validateSchema(JSON.parse(JSON.stringify(message)))).toBe(false)
    }
  })

  test('enforces runtime-only sample sequence and serialized-size limits', () => {
    const maximumWidthOutputs = Object.fromEntries(Array.from({ length: 512 }, (_, index) => {
      const prefix = `output-${index}-`
      return [`${prefix}${'x'.repeat(256 - prefix.length)}`, index]
    }))
    const maximumWidthBatch = {
      type: DIGITAL_TWIN_MESSAGE.SAMPLES,
      version: 1,
      samples: [{ time: 0, outputs: maximumWidthOutputs }],
    }
    expect(validateSchema(maximumWidthBatch)).toBe(true)
    expect(isValidHostMessage(maximumWidthBatch)).toBe(true)

    const maximumCountBatch = {
      type: DIGITAL_TWIN_MESSAGE.SAMPLES,
      version: 1,
      samples: Array.from({ length: MAX_SAMPLES_PER_BATCH }, (_, index) => ({
        time: index,
        outputs: { state: index },
      })),
    }
    expect(validateSchema(maximumCountBatch)).toBe(true)
    expect(isValidHostMessage(maximumCountBatch)).toBe(true)

    const discontinuousBatch = {
      type: DIGITAL_TWIN_MESSAGE.SAMPLES,
      version: 1,
      runId: 'run:1',
      batchId: 'batch:1',
      firstSampleIndex: 0,
      lastSampleIndex: 2,
      samples: [{ time: 0, outputs: {} }],
    }
    expect(validateSchema(discontinuousBatch)).toBe(true)
    expect(isValidHostMessage(discontinuousBatch)).toBe(false)

    const wideOutputs = Object.fromEntries(Array.from({ length: 512 }, (_, index) => [
      `output-${index}-${'x'.repeat(230)}`,
      index,
    ]))
    const largeBatch = {
      type: DIGITAL_TWIN_MESSAGE.SAMPLES,
      version: 1,
      samples: Array.from({ length: 10 }, (_, index) => ({ time: index, outputs: wideOutputs })),
    }
    expect(validateSchema(largeBatch)).toBe(true)
    expect(isValidHostMessage(largeBatch)).toBe(false)
  })
})
