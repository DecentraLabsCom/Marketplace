// Tests for puc.js
import { normalizePuc, getNormalizedPucFromSession } from '../puc';

describe('normalizePuc', () => {
  it('returns null for non-string values', () => {
    expect(normalizePuc(null)).toBeNull();
    expect(normalizePuc(undefined)).toBeNull();
    expect(normalizePuc(123)).toBeNull();
    expect(normalizePuc({})).toBeNull();
  });

  it('returns null for empty or whitespace-only strings', () => {
    expect(normalizePuc('')).toBeNull();
    expect(normalizePuc('   ')).toBeNull();
  });

  it('returns trimmed string if not a SCHAC PUC urn', () => {
    expect(normalizePuc('  user-123  ')).toBe('user-123');
    expect(normalizePuc('foo:bar:baz')).toBe('foo:bar:baz');
  });

  it('strips urn semantics for SCHAC PUC', () => {
    expect(normalizePuc('urn:mace:terena.org:schac:personalUniqueCode:int:es:university:123456')).toBe('123456');
    expect(normalizePuc('urn:schac:personalUniqueCode:int:es:university:abcdef')).toBe('abcdef');
    expect(normalizePuc('urn:schac:PersonalUniqueCode:int:es:university:XYZ')).toBe('XYZ');
  });

  it('returns trimmed string if urn is malformed', () => {
    expect(normalizePuc('urn:schac:personalUniqueCode:')).toBe('personalUniqueCode');
    expect(normalizePuc('urn:schac:personalUniqueCode')).toBe('personalUniqueCode');
  });
});

describe('getNormalizedPucFromSession', () => {
  it('returns principalName|targetedId if both present', () => {
    expect(getNormalizedPucFromSession({ eduPersonPrincipalName: 'foo', eduPersonTargetedID: 'bar' })).toBe('foo|bar');
  });
  it('returns principalName if only principalName present', () => {
    expect(getNormalizedPucFromSession({ eduPersonPrincipalName: 'foo' })).toBe('foo');
  });
  it('returns trimmed principalName and targetedId', () => {
    expect(getNormalizedPucFromSession({ eduPersonPrincipalName: ' foo ', eduPersonTargetedID: ' bar ' })).toBe('foo|bar');
  });
  it('returns session.id if principalName missing', () => {
    expect(getNormalizedPucFromSession({ id: 'session-123' })).toBe('session-123');
  });
  it('returns null if no valid identifier', () => {
    expect(getNormalizedPucFromSession({})).toBeNull();
    expect(getNormalizedPucFromSession(null)).toBeNull();
    expect(getNormalizedPucFromSession({ eduPersonPrincipalName: '', eduPersonTargetedID: '' })).toBeNull();
    expect(getNormalizedPucFromSession({ id: '   ' })).toBeNull();
  });
});
