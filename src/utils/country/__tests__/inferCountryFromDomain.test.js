/**
 * Unit tests for inferCountryFromDomain
 *
 * This utility is client-safe (no Node-only dependencies) so it runs cleanly
 * in the jsdom test environment without any mocks.
 */

import { inferCountryFromDomain } from '../inferCountryFromDomain';

describe('inferCountryFromDomain', () => {
  // ── standard ccTLDs ───────────────────────────────────────────────────────
  test('returns ISO-2 code for common ccTLDs', () => {
    expect(inferCountryFromDomain('uned.es')).toBe('ES');
    expect(inferCountryFromDomain('univ-paris.fr')).toBe('FR');
    expect(inferCountryFromDomain('tu-berlin.de')).toBe('DE');
    expect(inferCountryFromDomain('univ.pt')).toBe('PT');
    expect(inferCountryFromDomain('univ.it')).toBe('IT');
    expect(inferCountryFromDomain('univ.nl')).toBe('NL');
    expect(inferCountryFromDomain('univ.be')).toBe('BE');
    expect(inferCountryFromDomain('univ.pl')).toBe('PL');
    expect(inferCountryFromDomain('univ.mx')).toBe('MX');
    expect(inferCountryFromDomain('univ.ar')).toBe('AR');
    expect(inferCountryFromDomain('univ.br')).toBe('BR');
    expect(inferCountryFromDomain('univ.cl')).toBe('CL');
    expect(inferCountryFromDomain('univ.jp')).toBe('JP');
    expect(inferCountryFromDomain('univ.cn')).toBe('CN');
    expect(inferCountryFromDomain('univ.au')).toBe('AU');
    expect(inferCountryFromDomain('univ.ca')).toBe('CA');
  });

  // ── ccTLD override: .uk → GB ──────────────────────────────────────────────
  test('maps .uk to GB (ISO code is GB, not UK)', () => {
    expect(inferCountryFromDomain('cam.ac.uk')).toBe('GB');
    expect(inferCountryFromDomain('ox.ac.uk')).toBe('GB');
  });

  // ── supranational / legacy overrides → null ───────────────────────────────
  test('returns null for supranational/legacy ccTLDs', () => {
    expect(inferCountryFromDomain('example.eu')).toBeNull();
    expect(inferCountryFromDomain('example.su')).toBeNull();
    expect(inferCountryFromDomain('example.ac')).toBeNull();
    expect(inferCountryFromDomain('example.tp')).toBeNull();
  });

  // ── gTLDs must not be treated as ccTLDs ──────────────────────────────────
  test('returns null for gTLDs', () => {
    expect(inferCountryFromDomain('mit.edu')).toBeNull();
    expect(inferCountryFromDomain('example.com')).toBeNull();
    expect(inferCountryFromDomain('example.org')).toBeNull();
    expect(inferCountryFromDomain('example.net')).toBeNull();
    expect(inferCountryFromDomain('example.io')).toBeNull();
    expect(inferCountryFromDomain('example.ai')).toBeNull();
    expect(inferCountryFromDomain('example.app')).toBeNull();
    expect(inferCountryFromDomain('example.dev')).toBeNull();
    expect(inferCountryFromDomain('example.gov')).toBeNull();
  });

  // ── multi-level domains (second-level ccTLD zones) ────────────────────────
  test('uses the rightmost TLD for multi-label domains', () => {
    // .ac.uk → last segment is .uk → GB
    expect(inferCountryFromDomain('cam.ac.uk')).toBe('GB');
    // .edu.es → last segment is .es → ES
    expect(inferCountryFromDomain('univ.edu.es')).toBe('ES');
    // .edu.mx → last segment is .mx → MX
    expect(inferCountryFromDomain('univ.edu.mx')).toBe('MX');
  });

  // ── case insensitivity ────────────────────────────────────────────────────
  test('is case-insensitive', () => {
    expect(inferCountryFromDomain('UNED.ES')).toBe('ES');
    expect(inferCountryFromDomain('Cam.Ac.UK')).toBe('GB');
  });

  // ── invalid / edge inputs ─────────────────────────────────────────────────
  test('returns null for falsy or malformed inputs', () => {
    expect(inferCountryFromDomain(null)).toBeNull();
    expect(inferCountryFromDomain(undefined)).toBeNull();
    expect(inferCountryFromDomain('')).toBeNull();
    expect(inferCountryFromDomain('nodots')).toBeNull();
    expect(inferCountryFromDomain('  ')).toBeNull();
  });

  // ── unknown 2-char TLD (not in ISO list) ──────────────────────────────────
  test('returns null for non-ISO 2-char TLDs', () => {
    // 'zz' is not a valid ISO 3166-1 alpha-2 code
    expect(inferCountryFromDomain('example.zz')).toBeNull();
  });
});
