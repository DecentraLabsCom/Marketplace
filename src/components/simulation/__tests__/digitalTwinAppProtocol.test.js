import Ajv2020 from 'ajv/dist/2020.js'
import { readFileSync } from 'node:fs'
import { isValidAppMessage, isValidHostMessage, isValidConnectionConfig, isValidSample, isValidParameters } from '@decentralabs/digital-twin-app-protocol'
const schema = JSON.parse(readFileSync('packages/digital-twin-app-protocol/schema-v2.json', 'utf8'))
const validate = new Ajv2020({ strict: false }).compile(schema)
const grant = { protocolVersion: '1.0', gatewayWsUrl: 'wss://provider.example/fmu/api/v1/fmu/sessions', labId: '42', reservationKey: 'res:1', sessionTicket: 'one-use-ticket', ticketExpiresAt: 4102444800 }
const examples = [
  ['app', { type: 'decentralabs:digital-twin-ready', version: 2, capabilities: ['playback-rate', 'execution-control'] }],
  ['app', { type: 'decentralabs:fmu-connection-request', version: 2, requestId: 'grant:1', options: { stopTime: 20 } }],
  ['app', { type: 'decentralabs:execution-state', version: 2, runId: 'run:1', state: 'completed' }],
  ['host', { type: 'decentralabs:digital-twin-host-ready', version: 2, extensions: { qfmu: { enableModelSelection: true } } }],
  ['host', { type: 'decentralabs:fmu-connection-ready', version: 2, requestId: 'grant:1', connection: grant, inputSchedule: [{ time: 1, values: { x: 3 } }] }],
  ['host', { type: 'decentralabs:execution-cancel', version: 2, runId: 'run:1' }],
]
test('the published schema matches the SDK schema', () => expect(JSON.parse(readFileSync('docs/provider/digital-twin-threejs-app-contract.schema.json', 'utf8'))).toEqual(schema))
test.each(examples)('validates %s messages using the schema and SDK', (direction, value) => {
  expect(validate(value)).toBe(true)
  expect(direction === 'app' ? isValidAppMessage(value) : isValidHostMessage(value)).toBe(true)
  expect(validate({ ...value, unexpected: true })).toBe(false)
  expect(direction === 'app' ? isValidAppMessage({ ...value, unexpected: true }) : isValidHostMessage({ ...value, unexpected: true })).toBe(false)
})
test('the host contract accepts only defined app and host messages', () => {
  expect(isValidAppMessage({ type: 'decentralabs:unsupported-app-message', version: 2 })).toBe(false)
  expect(isValidHostMessage({ type: 'decentralabs:unsupported-host-message', version: 2 })).toBe(false)
  expect(isValidAppMessage({ ...examples[0][1], version: 3 })).toBe(false)
})
test.each(['ws://remote.example/socket', 'wss://user:secret@provider.example/socket', 'wss://provider.example/socket?token=secret'])('rejects unsafe grant endpoint %s', (gatewayWsUrl) => expect(isValidConnectionConfig({ ...grant, gatewayWsUrl })).toBe(false))
test('validates scalar output and parameter boundaries for the direct FMU client', () => {
  expect(isValidSample({ time: 0, outputs: Object.fromEntries(Array.from({ length: 512 }, (_, i) => ['x'.repeat(250) + i, 1])) })).toBe(true)
  expect(isValidSample({ time: 0, outputs: { x: Infinity } })).toBe(false)
  expect(isValidParameters(Object.fromEntries(Array.from({ length: 257 }, (_, i) => ['x' + i, 1])))).toBe(false)
})
