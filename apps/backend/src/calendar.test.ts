import { describe, expect, it } from 'vitest'

import { CalendarError, CalendarService, InMemoryCalendarStore } from './calendar.js'

describe('CalendarService', () => {
  it('creates immutable meeting types and lists them publicly', () => {
    const service = new CalendarService()
    const meetingType = service.createMeetingType({
      name: 'Созвон',
      durationMinutes: 30,
      description: 'Короткая встреча',
    })

    expect(meetingType.id).toMatch(/^[0-9a-f-]{36}$/)
    expect(Object.isFrozen(meetingType)).toBe(true)
    expect(service.listMeetingTypes()).toEqual([meetingType])
    expect(Object.isFrozen(service.listMeetingTypes())).toBe(true)
  })

  it('rejects duplicate names and invalid durations', () => {
    const service = new CalendarService({ store: new InMemoryCalendarStore() })
    service.createMeetingType({ name: 'Созвон', durationMinutes: 30 })

    expect(() => service.createMeetingType({ name: ' Созвон ', durationMinutes: 30 })).toThrow(CalendarError)
    expect(() => service.createMeetingType({ name: 'Другое', durationMinutes: 7 })).toThrow(CalendarError)
  })
})
