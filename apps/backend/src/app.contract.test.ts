import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it } from 'vitest'
import type { FastifyInstance, LightMyRequestResponse } from 'fastify'
import Ajv2020Module from 'ajv/dist/2020.js'
import addFormatsModule from 'ajv-formats'
import { parse } from 'yaml'

import { buildApp } from './app.js'
import { CalendarService } from './calendar.js'

interface ResponseSpec {
  content: Record<string, { schema: Record<string, unknown> }>
}

interface OperationSpec {
  operationId: string
  responses: Record<string, ResponseSpec>
}

interface OpenApiSpec {
  paths: Record<string, Record<string, OperationSpec>>
  components: { schemas: Record<string, unknown> }
}

const specification = parse(
  readFileSync(new URL('../../../packages/contracts/openapi/openapi.yaml', import.meta.url), 'utf8'),
) as OpenApiSpec

const operations = Object.entries(specification.paths).flatMap(([path, methods]) =>
  Object.entries(methods).map(([method, operation]) => ({ path, method, operation })),
)

const operationById = (operationId: string) => {
  const matches = operations.filter(({ operation }) => operation.operationId === operationId)
  expect(matches).toHaveLength(1)
  const match = matches[0]
  if (!match) throw new Error(`OpenAPI operation ${operationId} is missing`)
  return match
}

const validator = new Ajv2020Module.default({
  allErrors: true,
  strict: false,
  coerceTypes: false,
  removeAdditional: false,
})
addFormatsModule.default(validator)
validator.addFormat('int32', {
  type: 'number',
  validate: (value: number) => Number.isInteger(value) && value >= -2147483648 && value <= 2147483647,
})

const responseValidators = new Map<string, ReturnType<typeof validator.compile>>()

const expectContractResponse = (
  response: LightMyRequestResponse,
  operationId: string,
  status: number,
  mediaType: 'application/json' | 'application/problem+json',
  code?: string,
) => {
  const { operation } = operationById(operationId)
  const responseSpec = operation.responses[String(status)]
  expect(responseSpec).toBeDefined()
  if (!responseSpec) throw new Error(`${operationId} does not declare status ${status}`)

  const content = responseSpec.content[mediaType]
  expect(content).toBeDefined()
  if (!content) throw new Error(`${operationId} ${status} does not declare ${mediaType}`)

  expect(response.statusCode).toBe(status)
  expect(String(response.headers['content-type']).split(';')[0]).toBe(mediaType)

  const key = `${operationId}:${status}:${mediaType}`
  let validate = responseValidators.get(key)
  if (!validate) {
    validate = validator.compile({ ...content.schema, components: specification.components })
    responseValidators.set(key, validate)
  }
  const body: unknown = response.json()
  expect(validate(body), JSON.stringify(validate.errors)).toBe(true)
  if (mediaType === 'application/problem+json') {
    expect(body).toHaveProperty('status', status)
    expect(body).toHaveProperty('code', code)
  }
  return body
}

const injectOperation = (
  app: FastifyInstance,
  operationId: string,
  options: { pathParams?: Record<string, string>; payload?: Record<string, unknown>; headers?: Record<string, string> } = {},
) => {
  const { path, method } = operationById(operationId)
  const url = path.replace(/\{(\w+)\}/g, (_placeholder, name: string) => {
    const value = options.pathParams?.[name]
    if (value === undefined) throw new Error(`Missing path parameter ${name}`)
    return encodeURIComponent(value)
  })
  return app.inject({
    method: method.toUpperCase() as 'GET' | 'POST',
    url,
    payload: options.payload,
    headers: options.headers,
  })
}

describe('calendar HTTP response contract', () => {
  const apps: FastifyInstance[] = []
  const createApp = () => {
    const app = buildApp(new CalendarService({ now: () => new Date('2026-11-10T05:00:00Z') }))
    apps.push(app)
    return app
  }
  afterEach(async () => {
    await Promise.all(apps.splice(0).map((app) => app.close()))
  })

  it('declares the five expected paths and HTTP methods', () => {
    expect(operations.map(({ path, method, operation }) => [operation.operationId, method, path]).sort()).toEqual([
      ['createBooking', 'post', '/api/bookings'],
      ['createMeetingType', 'post', '/api/owner/meeting-types'],
      ['listMeetingTypeSlots', 'get', '/api/meeting-types/{meetingTypeId}/slots'],
      ['listMeetingTypes', 'get', '/api/meeting-types'],
      ['listOwnerBookings', 'get', '/api/owner/bookings'],
    ])
  })

  it('validates successful responses for all five operations', async () => {
    const app = createApp()
    const createdType = await injectOperation(app, 'createMeetingType', {
      payload: { name: 'Знакомство', durationMinutes: 30, description: 'Первый разговор' },
    })
    const meetingType = expectContractResponse(createdType, 'createMeetingType', 201, 'application/json') as { id: string }

    const listedTypes = await injectOperation(app, 'listMeetingTypes')
    const meetingTypes = expectContractResponse(listedTypes, 'listMeetingTypes', 200, 'application/json') as unknown[]
    expect(meetingTypes).toHaveLength(1)

    const listedSlots = await injectOperation(app, 'listMeetingTypeSlots', {
      pathParams: { meetingTypeId: meetingType.id },
    })
    const slots = expectContractResponse(listedSlots, 'listMeetingTypeSlots', 200, 'application/json') as Array<{ startAt: string }>
    const startAt = slots[0]?.startAt
    if (!startAt) throw new Error('Expected at least one available slot')

    const createdBooking = await injectOperation(app, 'createBooking', {
      headers: { 'Idempotency-Key': 'contract-success' },
      payload: { meetingTypeId: meetingType.id, startAt, guestName: 'Гость', guestEmail: 'guest@example.com' },
    })
    expectContractResponse(createdBooking, 'createBooking', 201, 'application/json')

    const ownerBookings = await injectOperation(app, 'listOwnerBookings')
    const bookings = expectContractResponse(ownerBookings, 'listOwnerBookings', 200, 'application/json') as unknown[]
    expect(bookings).toHaveLength(1)
  })

  it('validates 400 and 422 data errors', async () => {
    const app = createApp()
    const invalidType = await injectOperation(app, 'createMeetingType', {
      payload: { name: 'Созвон', durationMinutes: 30, unexpected: true },
    })
    expectContractResponse(invalidType, 'createMeetingType', 400, 'application/problem+json', 'VALIDATION_ERROR')

    const invalidName = await injectOperation(app, 'createMeetingType', {
      payload: { name: ' ', durationMinutes: 30 },
    })
    expectContractResponse(invalidName, 'createMeetingType', 422, 'application/problem+json', 'VALIDATION_ERROR')

    const createdType = await injectOperation(app, 'createMeetingType', {
      payload: { name: 'Созвон', durationMinutes: 30 },
    })
    const meetingType = expectContractResponse(createdType, 'createMeetingType', 201, 'application/json') as { id: string }
    const invalidBooking = await injectOperation(app, 'createBooking', {
      headers: { 'Idempotency-Key': 'invalid-booking' },
      payload: { meetingTypeId: meetingType.id, startAt: 'not-a-date', guestName: 'Гость', guestEmail: 'guest@example.com' },
    })
    expectContractResponse(invalidBooking, 'createBooking', 400, 'application/problem+json', 'VALIDATION_ERROR')
  })

  it('validates 404 responses for an unknown meeting type', async () => {
    const app = createApp()
    const missingSlots = await injectOperation(app, 'listMeetingTypeSlots', {
      pathParams: { meetingTypeId: 'unknown' },
    })
    expectContractResponse(missingSlots, 'listMeetingTypeSlots', 404, 'application/problem+json', 'MEETING_TYPE_NOT_FOUND')

    const missingBookingType = await injectOperation(app, 'createBooking', {
      headers: { 'Idempotency-Key': 'missing-type' },
      payload: { meetingTypeId: 'unknown', startAt: '2026-11-11T06:00:00.000Z', guestName: 'Гость', guestEmail: 'guest@example.com' },
    })
    expectContractResponse(missingBookingType, 'createBooking', 404, 'application/problem+json', 'MEETING_TYPE_NOT_FOUND')
  })

  it('validates all three declared conflict codes', async () => {
    const app = createApp()
    const typePayload = { name: 'Знакомство', durationMinutes: 30 }
    const createdType = await injectOperation(app, 'createMeetingType', { payload: typePayload })
    const meetingType = expectContractResponse(createdType, 'createMeetingType', 201, 'application/json') as { id: string }

    const duplicateName = await injectOperation(app, 'createMeetingType', { payload: typePayload })
    expectContractResponse(duplicateName, 'createMeetingType', 409, 'application/problem+json', 'MEETING_TYPE_NAME_TAKEN')

    const listedSlots = await injectOperation(app, 'listMeetingTypeSlots', {
      pathParams: { meetingTypeId: meetingType.id },
    })
    const slots = expectContractResponse(listedSlots, 'listMeetingTypeSlots', 200, 'application/json') as Array<{ startAt: string }>
    const startAt = slots[0]?.startAt
    if (!startAt) throw new Error('Expected at least one available slot')
    const payload = { meetingTypeId: meetingType.id, startAt, guestName: 'Гость', guestEmail: 'guest@example.com' }
    const firstBooking = await injectOperation(app, 'createBooking', {
      headers: { 'Idempotency-Key': 'first-booking' }, payload,
    })
    expectContractResponse(firstBooking, 'createBooking', 201, 'application/json')

    const occupiedSlot = await injectOperation(app, 'createBooking', {
      headers: { 'Idempotency-Key': 'second-booking' }, payload,
    })
    expectContractResponse(occupiedSlot, 'createBooking', 409, 'application/problem+json', 'SLOT_UNAVAILABLE')

    const reusedKey = await injectOperation(app, 'createBooking', {
      headers: { 'Idempotency-Key': 'first-booking' },
      payload: { ...payload, guestName: 'Другой гость' },
    })
    expectContractResponse(reusedKey, 'createBooking', 409, 'application/problem+json', 'IDEMPOTENCY_KEY_REUSED')
  })
})
