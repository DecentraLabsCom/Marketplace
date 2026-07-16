import {
  formatDateTimeInTimeZone,
  getSelectedSlotTimeZonePresentation,
  isSupportedTimeZone,
} from '../timeZonePresentation'

describe('timeZonePresentation', () => {
  test('formats a selected instant in both the local and lab time zones', () => {
    const presentation = getSelectedSlotTimeZonePresentation({
      date: new Date(2026, 0, 15),
      selectedTime: '10:00',
      labTimeZone: 'Europe/Madrid',
    })

    expect(presentation).toEqual(expect.objectContaining({
      labTimeZone: 'Europe/Madrid',
      localTimeZone: expect.any(String),
      labTime: expect.any(String),
      localTime: expect.any(String),
    }))
  })

  test('uses the selected instant when daylight-saving time changes', () => {
    const winter = formatDateTimeInTimeZone(
      new Date('2026-01-15T10:00:00Z'),
      'Europe/Madrid'
    )
    const summer = formatDateTimeInTimeZone(
      new Date('2026-07-15T10:00:00Z'),
      'Europe/Madrid'
    )

    expect(winter).toMatch(/11:00/)
    expect(summer).toMatch(/12:00/)
  })

  test('does not present an unsupported lab time zone as authoritative', () => {
    expect(isSupportedTimeZone('Not/A-Time-Zone')).toBe(false)
    expect(getSelectedSlotTimeZonePresentation({
      date: new Date(2026, 0, 15),
      selectedTime: '10:00',
      labTimeZone: 'Not/A-Time-Zone',
    })).toBeNull()
  })
})
