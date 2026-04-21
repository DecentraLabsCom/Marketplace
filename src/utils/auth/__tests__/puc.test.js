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

  test('getNormalizedPucFromSession lowercases eppn and ignores targeted id', () => {
    expect(
      getNormalizedPucFromSession({
        eduPersonPrincipalName: 'Alice@UNED.ES ',
        eduPersonTargetedID: ' Targeted-Alice ',
      })
    ).toBe('alice@uned.es')
  })

  test('getNormalizedPucFromSession returns null when eppn is missing', () => {
    expect(getNormalizedPucFromSession({ id: ' MixedCase-UserId ' })).toBeNull()
  })

  test('hashNormalizedPuc hashes canonical lowercase value', () => {
    expect(hashNormalizedPuc(' User@University.EDU ')).toBe(
      keccak256(toUtf8Bytes('user@university.edu'))
    )
  })

  test('getPucHashFromSession hashes canonical eppn only', () => {
    expect(
      getPucHashFromSession({
        eduPersonPrincipalName: 'Alice@UNED.ES',
        eduPersonTargetedID: 'Targeted-Alice',
      })
    ).toBe(keccak256(toUtf8Bytes('alice@uned.es')))
  })
})
