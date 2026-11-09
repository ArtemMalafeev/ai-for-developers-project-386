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
})
