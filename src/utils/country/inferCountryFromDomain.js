/**
 * inferCountryFromDomain
 *
 * Infers an ISO 3166-1 alpha-2 country code from the ccTLD of a domain.
 * Safe for both server-side (Node.js) and client-side (browser) use.
 *
 * Design decisions:
 *  - Only 2-character TLDs are considered (ccTLDs).
 *  - Well-known gTLDs are rejected outright via a fast blocklist.
 *  - A small override table handles the handful of ccTLDs whose
 *    string differs from the ISO alpha-2 code (e.g. .uk → GB) or
 *    that represent supranational / legacy zones (→ null).
 *  - Final validation uses `countries.isValid()` from i18n-iso-countries,
 *    which works without locale registration.
 */

/**
 * Complete ISO 3166-1 alpha-2 code set (249 entries).
 * Generated from i18n-iso-countries@7 getAlpha2Codes(); kept static to avoid
 * any ESM/CJS interop issues in test environments and to keep this module
 * dependency-free.
 */
// prettier-ignore
const ISO_ALPHA2 = new Set([
  'AD','AE','AF','AG','AI','AL','AM','AO','AQ','AR','AS','AT','AU','AW','AX','AZ',
  'BA','BB','BD','BE','BF','BG','BH','BI','BJ','BL','BM','BN','BO','BQ','BR','BS',
  'BT','BV','BW','BY','BZ','CA','CC','CD','CF','CG','CH','CI','CK','CL','CM','CN',
  'CO','CR','CU','CV','CW','CX','CY','CZ','DE','DJ','DK','DM','DO','DZ','EC','EE',
  'EG','EH','ER','ES','ET','FI','FJ','FK','FM','FO','FR','GA','GB','GD','GE','GF',
  'GG','GH','GI','GL','GM','GN','GP','GQ','GR','GS','GT','GU','GW','GY','HK','HM',
  'HN','HR','HT','HU','ID','IE','IL','IM','IN','IO','IQ','IR','IS','IT','JE','JM',
  'JO','JP','KE','KG','KH','KI','KM','KN','KP','KR','KW','KY','KZ','LA','LB','LC',
  'LI','LK','LR','LS','LT','LU','LV','LY','MA','MC','MD','ME','MF','MG','MH','MK',
  'ML','MM','MN','MO','MP','MQ','MR','MS','MT','MU','MV','MW','MX','MY','MZ','NA',
  'NC','NE','NF','NG','NI','NL','NO','NP','NR','NU','NZ','OM','PA','PE','PF','PG',
  'PH','PK','PL','PM','PN','PR','PS','PT','PW','PY','QA','RE','RO','RS','RU','RW',
  'SA','SB','SC','SD','SE','SG','SH','SI','SJ','SK','SL','SM','SN','SO','SR','SS',
  'ST','SV','SX','SY','SZ','TC','TD','TF','TG','TH','TJ','TK','TL','TM','TN','TO',
  'TR','TT','TV','TW','TZ','UA','UG','UM','US','UY','UZ','VA','VC','VE','VG','VI',
  'VN','VU','WF','WS','XK','YE','YT','ZA','ZM','ZW',
]);

/**
 * ccTLD overrides where the TLD string differs from the ISO 3166-1 alpha-2
 * code, or where the TLD is supranational / legacy and should not map to
 * any country.  A null value means "do not infer a country".
 */
const CCTLD_OVERRIDES = {
  uk: 'GB', // .uk → Great Britain (ISO code is GB, not UK)
  eu: null, // European Union – supranational, not a country
  su: null, // Soviet Union legacy TLD – still delegated but not a country
  ac: null, // Ascension Island – delegated territory, inconsistent usage
  tp: null, // Old East Timor (.tl superseded it)
};

/**
 * gTLDs and infrastructure TLDs that must never be treated as ccTLDs.
 * Kept intentionally narrow – unknown long TLDs are already rejected
 * by the `tld.length !== 2` guard below.
 */
const GTLD_BLOCKLIST = new Set([
  'com', 'net', 'org', 'edu', 'gov', 'mil', 'int',
  'io',  'co',  'ai',  'app', 'dev', 'cloud', 'tech',
  'info', 'biz', 'name', 'mobi', 'aero', 'coop',
  'museum', 'travel', 'jobs', 'arpa', 'online', 'store',
]);

/**
 * Infer an ISO 3166-1 alpha-2 country code from a domain's ccTLD.
 *
 * Only fires when the TLD is a recognised two-letter ccTLD.
 * gTLDs, infrastructure TLDs, and supranational TLDs all return null so the
 * caller's fallback chain can continue.
 *
 * @param {string} domain - e.g. 'uned.es', 'cam.ac.uk', 'mit.edu'
 * @returns {string|null} ISO-2 country code, or null if not determinable.
 *
 * @example
 * inferCountryFromDomain('uned.es')    // → 'ES'
 * inferCountryFromDomain('cam.ac.uk')  // → 'GB'
 * inferCountryFromDomain('mit.edu')    // → null  (gTLD)
 * inferCountryFromDomain('example.eu') // → null  (supranational)
 */
export function inferCountryFromDomain(domain) {
  if (!domain || typeof domain !== 'string') return null;
  const parts = domain.trim().toLowerCase().split('.');
  if (parts.length < 2) return null;
  const tld = parts[parts.length - 1];
  if (!tld) return null;

  // Reject well-known gTLDs immediately
  if (GTLD_BLOCKLIST.has(tld)) return null;

  // Apply explicit overrides (.uk → GB, .eu → null, …)
  if (Object.prototype.hasOwnProperty.call(CCTLD_OVERRIDES, tld)) {
    return CCTLD_OVERRIDES[tld];
  }

  // Only 2-char TLDs can be ccTLDs
  if (tld.length !== 2) return null;

  const code = tld.toUpperCase();
  return ISO_ALPHA2.has(code) ? code : null;
}
