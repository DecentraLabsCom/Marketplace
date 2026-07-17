import { normalizeFmuFileName } from '../fmuFileName'

describe('normalizeFmuFileName', () => {
  test('trims and accepts a safe FMU filename', () => {
    expect(normalizeFmuFileName('  Bouncing Ball.fmu  ')).toBe('Bouncing Ball.fmu')
    expect(normalizeFmuFileName('model.FMU')).toBe('model.FMU')
  })

  test('rejects path traversal and path-like values', () => {
    expect(normalizeFmuFileName('../private.fmu')).toBeNull()
    expect(normalizeFmuFileName('folder/private.fmu')).toBeNull()
    expect(normalizeFmuFileName('folder\\private.fmu')).toBeNull()
  })

  test('rejects non-FMU, blank, and oversized values', () => {
    expect(normalizeFmuFileName('')).toBeNull()
    expect(normalizeFmuFileName('model.zip')).toBeNull()
    expect(normalizeFmuFileName(`a${'a'.repeat(251)}.fmu`)).toBeNull()
  })
})
