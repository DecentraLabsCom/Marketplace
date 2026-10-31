import {
  getFmiSceneBoundValue,
  getFmiSceneInputValueFromPosition,
  isDraggableFmiSceneBinding,
  normalizeFmiSceneBinding,
} from '../digital-twin/fmiSceneBindings'

describe('fmiSceneBindings', () => {
  const inputVariable = {
    name: 'gatePosition',
    causality: 'input',
    type: 'Real',
    min: 0,
    max: 5,
  }

  test('normalizes an existing scene binding against its FMI variable', () => {
    const normalized = normalizeFmiSceneBinding(
      { variable: 'gatePosition', target: 'position.x', scale: 2, offset: 1 },
      inputVariable,
    )

    expect(normalized).toEqual(expect.objectContaining({
      variable: inputVariable,
      target: 'position.x',
      property: 'position',
      axis: 'x',
      scale: 2,
      offset: 1,
    }))
  })

  test('applies the shared binding transform used for output-driven scene values', () => {
    const binding = normalizeFmiSceneBinding(
      { variable: 'gatePosition', target: 'position.x', scale: 2, offset: 1 },
      inputVariable,
    )

    expect(getFmiSceneBoundValue(1.5, binding)).toBe(4)
  })

  test('converts a dragged scene coordinate back to a clamped input value', () => {
    const binding = normalizeFmiSceneBinding(
      { variable: 'gatePosition', target: 'position.x', scale: 2, offset: 1 },
      inputVariable,
    )

    expect(getFmiSceneInputValueFromPosition(20, binding)).toBe(5)
    expect(getFmiSceneInputValueFromPosition(3, binding)).toBe(1)
    expect(getFmiSceneInputValueFromPosition(100_001, binding)).toBeNull()
  })

  test('snaps integer inputs and rejects bindings that cannot be dragged safely', () => {
    const integer = normalizeFmiSceneBinding(
      { variable: 'crateCount', target: 'position.y' },
      { name: 'crateCount', causality: 'input', type: 'Integer', min: 1, max: 8 },
    )
    const boolean = normalizeFmiSceneBinding(
      { variable: 'enabled', target: 'position.x' },
      { name: 'enabled', causality: 'input', type: 'Boolean' },
    )
    const rotation = normalizeFmiSceneBinding(
      { variable: 'gatePosition', target: 'rotation.x' },
      inputVariable,
    )
    const zeroScale = normalizeFmiSceneBinding(
      { variable: 'gatePosition', target: 'position.z', scale: 0 },
      inputVariable,
    )

    expect(getFmiSceneInputValueFromPosition(3.6, integer)).toBe(4)
    expect(isDraggableFmiSceneBinding(integer)).toBe(true)
    expect(isDraggableFmiSceneBinding(boolean)).toBe(false)
    expect(isDraggableFmiSceneBinding(rotation)).toBe(false)
    expect(isDraggableFmiSceneBinding(zeroScale)).toBe(false)
  })

  test('ignores malformed, unsupported, or non-input bindings for dragging', () => {
    expect(normalizeFmiSceneBinding(null, inputVariable)).toBeNull()
    expect(normalizeFmiSceneBinding({ variable: 'other', target: 'position.x' }, inputVariable)).toBeNull()
    expect(normalizeFmiSceneBinding(
      { variable: 'gatePosition', target: 'visible' },
      inputVariable,
    )).toEqual(expect.objectContaining({ axis: null }))
    expect(isDraggableFmiSceneBinding(normalizeFmiSceneBinding(
      { variable: 'speed', target: 'position.x' },
      { name: 'speed', causality: 'output', type: 'Real' },
    ))).toBe(false)
  })
})
