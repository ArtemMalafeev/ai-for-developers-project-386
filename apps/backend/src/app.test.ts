import { afterEach, describe, expect, it } from 'vitest'

import { buildApp } from './app.js'
import { CalendarService } from './calendar.js'

describe('calendar HTTP API', () => {
  const apps: Array<{ close: () => Promise<void> }> = []
  afterEach(async () => {
    await Promise.all(apps.splice(0).map((app) => app.close()))
  })

  it('creates a meeting type and returns it from the public list', async () => {
    const app = buildApp(new CalendarService())
    apps.push(app)
    const createResponse = await app.inject({
      method: 'POST',
      url: '/api/owner/meeting-types',
      payload: { name: 'Знакомство', durationMinutes: 30 },
    })
    expect(createResponse.statusCode).toBe(201)
    const created = createResponse.json()

    const listResponse = await app.inject({ method: 'GET', url: '/api/meeting-types' })
    expect(listResponse.statusCode).toBe(200)
    expect(listResponse.json()).toEqual([created])
  })

  it('returns a problem when a name is duplicated', async () => {
    const app = buildApp(new CalendarService())
    apps.push(app)
    const payload = { name: 'Знакомство', durationMinutes: 30 }
    await app.inject({ method: 'POST', url: '/api/owner/meeting-types', payload })
    const response = await app.inject({ method: 'POST', url: '/api/owner/meeting-types', payload })

    expect(response.statusCode).toBe(409)
    expect(response.json().code).toBe('MEETING_TYPE_NAME_TAKEN')
  })

  it('returns Problem Details for schema validation failures', async () => {
    const app = buildApp(new CalendarService())
    apps.push(app)

    const response = await app.inject({
      method: 'POST',
      url: '/api/owner/meeting-types',
      payload: { name: 'Созвон', durationMinutes: 30, unexpected: true },
    })

    expect(response.statusCode).toBe(400)
    expect(response.headers['content-type']).toContain('application/problem+json')
    expect(response.json()).toMatchObject({
      type: 'https://example.com/problems/validation-error',
      status: 400,
      code: 'VALIDATION_ERROR',
    })
  })

  it('requires an idempotency key and validates booking fields before service logic', async () => {
    const app = buildApp(new CalendarService())
    apps.push(app)
    const createResponse = await app.inject({
      method: 'POST',
      url: '/api/owner/meeting-types',
      payload: { name: 'Созвон', durationMinutes: 30 },
    })
    const meetingType = createResponse.json()

    const response = await app.inject({
      method: 'POST',
      url: '/api/bookings',
      payload: {
        meetingTypeId: meetingType.id,
        startAt: 'not-a-date',
        guestName: 'Гость',
        guestEmail: 'guest@example.com',
      },
    })

    expect(response.statusCode).toBe(400)
    expect(response.json().code).toBe('VALIDATION_ERROR')
  })

  it('returns a not-found Problem Details response for an unknown meeting type', async () => {
    const app = buildApp(new CalendarService())
    apps.push(app)

    const response = await app.inject({ method: 'GET', url: '/api/meeting-types/unknown/slots' })

    expect(response.statusCode).toBe(404)
    expect(response.headers['content-type']).toContain('application/problem+json')
    expect(response.json()).toMatchObject({ status: 404, code: 'MEETING_TYPE_NOT_FOUND' })
  })

  it('enforces contract field constraints and distinguishes semantic validation', async () => {
    const app = buildApp(new CalendarService())
    apps.push(app)

    const invalidDuration = await app.inject({
      method: 'POST',
      url: '/api/owner/meeting-types',
      payload: { name: 'Созвон', durationMinutes: 7 },
    })
    expect(invalidDuration.statusCode).toBe(400)
    expect(invalidDuration.headers['content-type']).toContain('application/problem+json')

    const semanticError = await app.inject({
      method: 'POST',
      url: '/api/owner/meeting-types',
      payload: { name: ' ', durationMinutes: 30 },
    })
    expect(semanticError.statusCode).toBe(422)
    expect(semanticError.json()).toMatchObject({ status: 422, code: 'VALIDATION_ERROR' })
  })

  it('creates a booking and returns a conflict for a reserved slot', async () => {
    const app = buildApp(new CalendarService({ now: () => new Date('2026-11-10T05:00:00Z') }))
    apps.push(app)
    const createdType = await app.inject({
      method: 'POST',
      url: '/api/owner/meeting-types',
      payload: { name: 'Знакомство', durationMinutes: 30 },
    })
    const meetingTypeId = createdType.json().id as string
    const slots = await app.inject({
      method: 'GET',
      url: `/api/meeting-types/${meetingTypeId}/slots`,
    })
    expect(slots.statusCode).toBe(200)
    const startAt = slots.json()[0]?.startAt as string
    expect(startAt).toBeTruthy()
    const payload = { meetingTypeId, startAt, guestName: 'Гость', guestEmail: 'guest@example.com' }
    const createdBooking = await app.inject({
      method: 'POST',
      url: '/api/bookings',
      headers: { 'Idempotency-Key': 'booking-1' },
      payload,
    })
    expect(createdBooking.statusCode).toBe(201)
    expect(createdBooking.headers['content-type']).toContain('application/json')
    expect(createdBooking.json()).toMatchObject({ guestName: 'Гость', startAt })

    const conflict = await app.inject({
      method: 'POST',
      url: '/api/bookings',
      headers: { 'Idempotency-Key': 'booking-2' },
      payload,
    })
    expect(conflict.statusCode).toBe(409)
    expect(conflict.headers['content-type']).toContain('application/problem+json')
    expect(conflict.json()).toMatchObject({ status: 409, code: 'SLOT_UNAVAILABLE' })
  })

  it('rejects a stale half-hour slot after an overlapping hour-long booking', async () => {
    const app = buildApp(new CalendarService({ now: () => new Date('2026-11-09T06:00:00.000Z') }))
    apps.push(app)
    const hourStart = '2026-11-09T06:00:00.000Z'
    const halfHourStart = '2026-11-09T06:30:00.000Z'
    const nextHourStart = '2026-11-09T07:00:00.000Z'

    const hourTypeResponse = await app.inject({
      method: 'POST',
      url: '/api/owner/meeting-types',
      payload: { name: 'Часовой звонок', durationMinutes: 60 },
    })
    const halfHourTypeResponse = await app.inject({
      method: 'POST',
      url: '/api/owner/meeting-types',
      payload: { name: 'Короткий звонок', durationMinutes: 30 },
    })
    expect(hourTypeResponse.statusCode).toBe(201)
    expect(halfHourTypeResponse.statusCode).toBe(201)
    const hourTypeId = hourTypeResponse.json().id as string
    const halfHourTypeId = halfHourTypeResponse.json().id as string

    const slotsBeforeBooking = await app.inject({
      method: 'GET',
      url: `/api/meeting-types/${halfHourTypeId}/slots`,
    })
    expect(slotsBeforeBooking.statusCode).toBe(200)
    expect(slotsBeforeBooking.json().map((slot: { startAt: string }) => slot.startAt)).toContain(halfHourStart)

    const hourBooking = await app.inject({
      method: 'POST',
      url: '/api/bookings',
      headers: { 'Idempotency-Key': 'cross-type-hour' },
      payload: {
        meetingTypeId: hourTypeId,
        startAt: hourStart,
        guestName: 'Первый гость',
        guestEmail: 'first@example.com',
      },
    })
    expect(hourBooking.statusCode).toBe(201)

    const slotsAfterBooking = await app.inject({
      method: 'GET',
      url: `/api/meeting-types/${halfHourTypeId}/slots`,
    })
    expect(slotsAfterBooking.statusCode).toBe(200)
    const availableStarts = slotsAfterBooking.json().map((slot: { startAt: string }) => slot.startAt)
    expect(availableStarts).not.toContain(hourStart)
    expect(availableStarts).not.toContain(halfHourStart)
    expect(availableStarts).toContain(nextHourStart)

    const overlappingBooking = await app.inject({
      method: 'POST',
      url: '/api/bookings',
      headers: { 'Idempotency-Key': 'cross-type-half-hour' },
      payload: {
        meetingTypeId: halfHourTypeId,
        startAt: halfHourStart,
        guestName: 'Второй гость',
        guestEmail: 'second@example.com',
      },
    })
    expect(overlappingBooking.statusCode).toBe(409)
    expect(overlappingBooking.headers['content-type']).toContain('application/problem+json')
    expect(overlappingBooking.json()).toMatchObject({ status: 409, code: 'SLOT_UNAVAILABLE' })
  })
})
