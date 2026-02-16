import {
  getBrowserCredentialMarkerState,
  hasBrowserCredentialMarkerVerified,
  markBrowserCredentialAdvisoryDismissed,
  markBrowserCredentialVerified,
  shouldShowBrowserCredentialAdvisory,
} from '../browserCredentialMarker'

describe('browserCredentialMarker', () => {
  const markerIdentity = {
    stableUserId: 'stable-user',
    institutionId: 'example.edu',
  }
  const storageKey = 'institutional_browser_passkey:example.edu:stable-user'

  beforeEach(() => {
    window.localStorage.clear()
    jest.restoreAllMocks()
  })

  it('treats legacy marker value as verified', () => {
    window.localStorage.setItem(storageKey, '1')

    expect(hasBrowserCredentialMarkerVerified(markerIdentity)).toBe(true)
    expect(shouldShowBrowserCredentialAdvisory(markerIdentity)).toBe(false)
  })

  it('marks advisory as dismissed without marking browser as verified', () => {
    markBrowserCredentialAdvisoryDismissed(markerIdentity)

    expect(hasBrowserCredentialMarkerVerified(markerIdentity)).toBe(false)
    expect(shouldShowBrowserCredentialAdvisory(markerIdentity)).toBe(false)
  })

  it('shows advisory again after cooldown when only dismissed', () => {
    const nowSpy = jest.spyOn(Date, 'now')
    nowSpy.mockReturnValue(1_000_000)
    markBrowserCredentialAdvisoryDismissed(markerIdentity)

    nowSpy.mockReturnValue(1_000_000 + 60_000)
    expect(
      shouldShowBrowserCredentialAdvisory(markerIdentity, { cooldownMs: 120_000 })
    ).toBe(false)

    nowSpy.mockReturnValue(1_000_000 + 180_000)
    expect(
      shouldShowBrowserCredentialAdvisory(markerIdentity, { cooldownMs: 120_000 })
    ).toBe(true)
  })

  it('clears advisory dismissal when browser becomes verified', () => {
    markBrowserCredentialAdvisoryDismissed(markerIdentity)
    markBrowserCredentialVerified(markerIdentity)

    const state = getBrowserCredentialMarkerState(markerIdentity)
    expect(Number.isFinite(state.verifiedAt)).toBe(true)
    expect(state.advisoryDismissedAt).toBeNull()
    expect(shouldShowBrowserCredentialAdvisory(markerIdentity)).toBe(false)
  })
})
