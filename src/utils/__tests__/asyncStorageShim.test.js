import AsyncStorage from '../asyncStorageShim'

describe('AsyncStorage shim', () => {
  beforeEach(async () => {
    await AsyncStorage.clear()
  })

  test('setItem/getItem stores and retrieves a value', async () => {
    await AsyncStorage.setItem('foo', 'bar')
    const value = await AsyncStorage.getItem('foo')
    expect(value).toBe('bar')
  })

  test('removeItem deletes a value', async () => {
    await AsyncStorage.setItem('foo', 'bar')
    await AsyncStorage.removeItem('foo')
    const value = await AsyncStorage.getItem('foo')
    expect(value).toBeNull()
  })

  test('clear removes all values', async () => {
    await AsyncStorage.setItem('a', '1')
    await AsyncStorage.setItem('b', '2')
    await AsyncStorage.clear()
    expect(await AsyncStorage.getItem('a')).toBeNull()
    expect(await AsyncStorage.getItem('b')).toBeNull()
  })

  test('getAllKeys returns all keys', async () => {
    await AsyncStorage.setItem('a', '1')
    await AsyncStorage.setItem('b', '2')
    const keys = await AsyncStorage.getAllKeys()
    expect(keys.sort()).toEqual(['a', 'b'])
  })

  test('multiSet/multiGet works for multiple keys', async () => {
    await AsyncStorage.multiSet([
      ['x', '10'],
      ['y', '20']
    ])
    const result = await AsyncStorage.multiGet(['x', 'y'])
    expect(result).toEqual([
      ['x', '10'],
      ['y', '20']
    ])
  })

  test('multiRemove deletes multiple keys', async () => {
    await AsyncStorage.multiSet([
      ['x', '10'],
      ['y', '20']
    ])
    await AsyncStorage.multiRemove(['x', 'y'])
    expect(await AsyncStorage.getItem('x')).toBeNull()
    expect(await AsyncStorage.getItem('y')).toBeNull()
  })

  test('mergeItem overwrites value', async () => {
    await AsyncStorage.setItem('foo', 'bar')
    await AsyncStorage.mergeItem('foo', 'baz')
    expect(await AsyncStorage.getItem('foo')).toBe('baz')
  })

  test('multiMerge overwrites multiple values', async () => {
    await AsyncStorage.multiSet([
      ['a', '1'],
      ['b', '2']
    ])
    await AsyncStorage.multiMerge([
      ['a', '10'],
      ['b', '20']
    ])
    expect(await AsyncStorage.getItem('a')).toBe('10')
    expect(await AsyncStorage.getItem('b')).toBe('20')
  })
})
