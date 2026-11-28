import { getVariableInputDetails, normalizeParameterValue } from '../utils/simulationParameters'

describe('integer simulation inputs', () => {
  const orderQuantity = { name: 'orderQuantity', type: 'Integer', min: '1', max: '6' }

  test('uses whole-number controls and respects declared FMI bounds', () => {
    const details = getVariableInputDetails(orderQuantity)

    expect(details.step).toBe(1)
    expect(details.min).toBe('1')
    expect(details.max).toBe('6')
    expect(normalizeParameterValue(orderQuantity, '3')).toBe(3)
  })

  test('rejects fractional and out-of-range integer inputs', () => {
    expect(() => normalizeParameterValue(orderQuantity, '2.5')).toThrow(/whole number/i)
    expect(() => normalizeParameterValue(orderQuantity, '0')).toThrow(/between 1 and 6/i)
    expect(() => normalizeParameterValue(orderQuantity, '7')).toThrow(/between 1 and 6/i)
  })
})
