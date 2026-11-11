import { describe, expect, it } from 'vitest'

import { CalendarError, CalendarService, InMemoryCalendarStore } from './calendar.js'

describe('CalendarService', () => {
  const now = new Date('2026-11-09T06:00:00.000Z')

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

  it('generates slots for the configured weekly schedule and excludes booked intervals', () => {
    const service = new CalendarService({ now: () => now })
    const meetingType = service.createMeetingType({ name: 'Созвон', durationMinutes: 60 })

    const slotsBeforeBooking = service.listSlots(meetingType.id)
    expect(slotsBeforeBooking[0]).toEqual({
      startAt: '2026-11-09T06:00:00.000Z',
      endAt: '2026-11-09T07:00:00.000Z',
    })
    expect(slotsBeforeBooking.every((slot) => new Date(slot.startAt).getUTCDay() > 0 && new Date(slot.startAt).getUTCDay() < 6)).toBe(true)

    const booking = service.createBooking({
      meetingTypeId: meetingType.id,
      startAt: slotsBeforeBooking[0].startAt,
      guestName: 'Гость',
      guestEmail: 'guest@example.com',
      idempotencyKey: 'slots-test',
    })
    expect(service.listSlots(meetingType.id)).not.toContainEqual({ startAt: booking.startAt, endAt: booking.endAt })
  })

  it('excludes starts overlapping a different meeting type and keeps the adjacent start', () => {
    const service = new CalendarService({ now: () => now })
    const hourType = service.createMeetingType({ name: 'Часовой звонок', durationMinutes: 60 })
    const halfHourType = service.createMeetingType({ name: 'Короткий звонок', durationMinutes: 30 })
    const hourStart = '2026-11-09T06:00:00.000Z'
    const halfHourStart = '2026-11-09T06:30:00.000Z'
    const nextHourStart = '2026-11-09T07:00:00.000Z'

    expect(service.listSlots(halfHourType.id).map((slot) => slot.startAt)).toEqual(
      expect.arrayContaining([hourStart, halfHourStart, nextHourStart]),
    )
    service.createBooking({
      meetingTypeId: hourType.id,
      startAt: hourStart,
      guestName: 'Первый гость',
      guestEmail: 'first@example.com',
      idempotencyKey: 'cross-type-hour',
    })

    const availableStarts = service.listSlots(halfHourType.id).map((slot) => slot.startAt)
    expect(availableStarts).not.toContain(hourStart)
    expect(availableStarts).not.toContain(halfHourStart)
    expect(availableStarts).toContain(nextHourStart)
  })

  it('keeps adjacent slots available and rejects overlapping bookings', () => {
    const service = new CalendarService({ now: () => now })
    const meetingType = service.createMeetingType({ name: 'Созвон', durationMinutes: 30 })
    const [first, second] = service.listSlots(meetingType.id)

    service.createBooking({
      meetingTypeId: meetingType.id,
      startAt: first.startAt,
      guestName: 'Первый гость',
      guestEmail: 'first@example.com',
      idempotencyKey: 'first-booking',
    })
    expect(() => service.createBooking({
      meetingTypeId: meetingType.id,
      startAt: first.startAt,
      guestName: 'Второй гость',
      guestEmail: 'second@example.com',
      idempotencyKey: 'second-booking',
    })).toThrowError(expect.objectContaining({ code: 'SLOT_UNAVAILABLE', status: 409 }))

    const adjacent = service.createBooking({
      meetingTypeId: meetingType.id,
      startAt: second.startAt,
      guestName: 'Второй гость',
      guestEmail: 'second@example.com',
      idempotencyKey: 'adjacent-booking',
    })
    expect(adjacent.startAt).toBe(second.startAt)
  })

  it('replays an idempotent request and rejects a changed payload', () => {
    const service = new CalendarService({ now: () => now })
    const meetingType = service.createMeetingType({ name: 'Созвон', durationMinutes: 30 })
    const slot = service.listSlots(meetingType.id)[0]
    const input = {
      meetingTypeId: meetingType.id,
      startAt: slot.startAt,
      guestName: 'Гость',
      guestEmail: 'guest@example.com',
      idempotencyKey: 'retry-key',
    }

    const first = service.createBooking(input)
    expect(service.createBooking(input)).toBe(first)
    expect(() => service.createBooking({ ...input, guestName: 'Другой гость' })).toThrowError(
      expect.objectContaining({ code: 'IDEMPOTENCY_KEY_REUSED', status: 409 }),
    )
  })

  it('allows only one booking when concurrent requests target the same slot', async () => {
    const service = new CalendarService({ now: () => now })
    const meetingType = service.createMeetingType({ name: 'Созвон', durationMinutes: 30 })
    const slot = service.listSlots(meetingType.id)[0]
    const results = await Promise.allSettled([
      Promise.resolve().then(() => service.createBooking({ meetingTypeId: meetingType.id, startAt: slot.startAt, guestName: 'Первый', guestEmail: 'one@example.com', idempotencyKey: 'concurrent-one' })),
      Promise.resolve().then(() => service.createBooking({ meetingTypeId: meetingType.id, startAt: slot.startAt, guestName: 'Второй', guestEmail: 'two@example.com', idempotencyKey: 'concurrent-two' })),
    ])

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1)
    expect(service.listBookings()).toHaveLength(1)
  })

  it('lists only upcoming bookings in chronological order', () => {
    let current = now
    const service = new CalendarService({ now: () => current })
    const meetingType = service.createMeetingType({ name: 'Созвон', durationMinutes: 30 })
    const slots = service.listSlots(meetingType.id)
    service.createBooking({ meetingTypeId: meetingType.id, startAt: slots[1].startAt, guestName: 'Позже', guestEmail: 'later@example.com', idempotencyKey: 'later' })
    service.createBooking({ meetingTypeId: meetingType.id, startAt: slots[0].startAt, guestName: 'Раньше', guestEmail: 'earlier@example.com', idempotencyKey: 'earlier' })

    expect(service.listBookings().map((booking) => booking.guestName)).toEqual(['Раньше', 'Позже'])
    current = new Date(slots[1].startAt)
    expect(service.listBookings().map((booking) => booking.guestName)).toEqual(['Позже'])
  })
})
