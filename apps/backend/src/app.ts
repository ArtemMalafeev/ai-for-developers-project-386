import Fastify, { type FastifyError, type FastifyInstance, type FastifyReply } from 'fastify'

import { CalendarError, CalendarService } from './calendar.js'

interface MeetingTypeBody {
  name?: unknown
  durationMinutes?: unknown
  description?: unknown
}

interface BookingBody {
  meetingTypeId?: unknown
  startAt?: unknown
  guestName?: unknown
  guestEmail?: unknown
}

const meetingTypeBodySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['name', 'durationMinutes'],
  properties: {
    name: { type: 'string', minLength: 1 },
    durationMinutes: { type: 'integer', minimum: 5, multipleOf: 5 },
    description: { type: 'string' },
  },
} as const

const bookingBodySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['meetingTypeId', 'startAt', 'guestName', 'guestEmail'],
  properties: {
    meetingTypeId: { type: 'string', minLength: 1 },
    startAt: { type: 'string', format: 'date-time' },
    guestName: { type: 'string', minLength: 1 },
    guestEmail: { type: 'string', format: 'email' },
  },
} as const

const meetingTypeParamsSchema = {
  type: 'object',
  required: ['meetingTypeId'],
  properties: { meetingTypeId: { type: 'string', minLength: 1 } },
} as const

const idempotencyHeadersSchema = {
  type: 'object',
  required: ['idempotency-key'],
  properties: { 'idempotency-key': { type: 'string', minLength: 1 } },
} as const

const problem = (error: CalendarError, reply: FastifyReply) =>
  reply.status(error.status).type('application/problem+json').send({
    type: `https://example.com/problems/${error.code.toLowerCase().replaceAll('_', '-')}`,
    title: error.message,
    status: error.status,
    code: error.code,
  })

const isValidationError = (error: unknown) => {
  if (!error || typeof error !== 'object') return false
  const candidate = error as Partial<FastifyError>
  return Boolean(candidate.validation) || candidate.code === 'FST_ERR_CTP_INVALID_JSON_BODY'
}

const withCalendarErrors = async (handler: () => unknown, reply: FastifyReply) => {
  try {
    return await handler()
  } catch (error) {
    if (error instanceof CalendarError) return problem(error, reply)
    throw error
  }
}

export const buildApp = (service = new CalendarService()): FastifyInstance => {
  const app = Fastify({
    logger: true,
    ajv: { customOptions: { removeAdditional: false } },
  })

  app.setErrorHandler((error, _request, reply) => {
    if (isValidationError(error)) {
      return problem(new CalendarError('VALIDATION_ERROR', 400, 'Request body is invalid.'), reply)
    }
    return reply.send(error)
  })

  app.get('/health', async () => ({ status: 'ok' }))
  app.get('/api/health', async () => ({ status: 'ok' }))

  app.get('/api/meeting-types', async (_request, reply) =>
    withCalendarErrors(() => service.listMeetingTypes(), reply),
  )

  app.post<{ Body: MeetingTypeBody }>('/api/owner/meeting-types', {
    schema: { body: meetingTypeBodySchema },
  }, async (request, reply) =>
    withCalendarErrors(() => {
      const body = request.body ?? {}
      if (typeof body.name !== 'string' || typeof body.durationMinutes !== 'number') {
        return problem(new CalendarError('VALIDATION_ERROR', 400, 'Request body is invalid.'), reply)
      }
      const meetingType = service.createMeetingType({
        name: body.name,
        durationMinutes: body.durationMinutes,
        ...(typeof body.description === 'string' ? { description: body.description } : {}),
      })
      return reply.status(201).send(meetingType)
    }, reply),
  )

  app.get<{ Params: { meetingTypeId: string } }>('/api/meeting-types/:meetingTypeId/slots', {
    schema: { params: meetingTypeParamsSchema },
  }, async (request, reply) =>
    withCalendarErrors(() => service.listSlots(request.params.meetingTypeId), reply),
  )

  app.post<{ Body: BookingBody }>('/api/bookings', {
    schema: { body: bookingBodySchema, headers: idempotencyHeadersSchema },
  }, async (request, reply) =>
    withCalendarErrors(() => {
      const body = request.body ?? {}
      const idempotencyKey = request.headers['idempotency-key']
      if (
        typeof idempotencyKey !== 'string' ||
        typeof body.meetingTypeId !== 'string' ||
        typeof body.startAt !== 'string' ||
        typeof body.guestName !== 'string' ||
        typeof body.guestEmail !== 'string'
      ) {
        return problem(new CalendarError('VALIDATION_ERROR', 400, 'Request body is invalid.'), reply)
      }
      const booking = service.createBooking({
        meetingTypeId: body.meetingTypeId,
        startAt: body.startAt,
        guestName: body.guestName,
        guestEmail: body.guestEmail,
        idempotencyKey,
      })
      return reply.status(201).send(booking)
    }, reply),
  )

  app.get('/api/owner/bookings', async (_request, reply) =>
    withCalendarErrors(() => service.listBookings(), reply),
  )

  return app
}
