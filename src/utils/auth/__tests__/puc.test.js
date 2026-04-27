import { keccak256, toUtf8Bytes } from 'ethers'
import {
  normalizePuc,
  getNormalizedPucFromSession,
  hashNormalizedPuc,
  getPucHashFromSession,
} from '../puc'

describe('puc normalization', () => {
  test('normalizePuc trims and lowercases generic identifiers', () => {
    expect(normalizePuc('  User@University.EDU|Targeted-ID  ')).toBe('user@university.edu|targeted-id')
  })

  test('normalizePuc extracts and lowercases SCHAC personalUniqueCode tail', () => {
    expect(normalizePuc('  urn:schac:personalUniqueCode:ES:DNI:12345678A  ')).toBe('12345678a')
  })

  test('getNormalizedPucFromSession lowercases composite shared identifier', () => {
    expect(
      getNormalizedPucFromSession({
        eduPersonPrincipalName: 'Alice@UNED.ES ',
        eduPersonTargetedID: ' Targeted-Alice ',
      })
    ).toBe('alice@uned.es|targeted-alice')
  })

  test('getNormalizedPucFromSession lowercases fallback session id', () => {
    expect(getNormalizedPucFromSession({ id: ' MixedCase-UserId ' })).toBe('mixedcase-userid')
  })

  test('hashNormalizedPuc hashes canonical lowercase value', () => {
    expect(hashNormalizedPuc(' User@University.EDU ')).toBe(
      keccak256(toUtf8Bytes('user@university.edu'))
    )
  })

  test('getPucHashFromSession hashes canonical composite shared identifier', () => {
    expect(
      getPucHashFromSession({
        eduPersonPrincipalName: 'Alice@UNED.ES',
        eduPersonTargetedID: 'Targeted-Alice',
      })
    ).toBe(keccak256(toUtf8Bytes('alice@uned.es|targeted-alice')))
  })
})
