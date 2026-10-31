import { getFmiInitialValue, isFmiBindingVisible } from '../digital-twin/fmiBindingVisibility'

describe('isFmiBindingVisible', () => {
  test('uses boolean visibility when no numeric threshold is declared', () => {
    expect(isFmiBindingVisible(true)).toBe(true)
    expect(isFmiBindingVisible(false)).toBe(false)
    expect(isFmiBindingVisible(0)).toBe(false)
    expect(isFmiBindingVisible(1)).toBe(true)
  })

  test('shows a bound object when a numeric output reaches its threshold', () => {
    const binding = { visibleWhenGreaterThanOrEqual: 3 }

    expect(isFmiBindingVisible(2, binding)).toBe(false)
    expect(isFmiBindingVisible(3, binding)).toBe(true)
    expect(isFmiBindingVisible(6, binding)).toBe(true)
  })

  test('hides the object for invalid threshold or output values', () => {
    expect(isFmiBindingVisible('unknown', { visibleWhenGreaterThanOrEqual: 1 })).toBe(false)
    expect(isFmiBindingVisible(4, { visibleWhenGreaterThanOrEqual: 'invalid' })).toBe(false)
  })
})

describe('getFmiInitialValue', () => {
  test('parses FMI Boolean and numeric start values', () => {
    expect(getFmiInitialValue({ type: 'Boolean', start: 'false' })).toBe(false)
    expect(getFmiInitialValue({ type: 'Boolean', start: 'true' })).toBe(true)
    expect(getFmiInitialValue({ type: 'Integer', start: '0' })).toBe(0)
    expect(getFmiInitialValue({ type: 'Real', start: '2.5' })).toBe(2.5)
  })
})
