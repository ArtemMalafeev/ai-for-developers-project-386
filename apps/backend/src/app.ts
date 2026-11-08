import Fastify, { type FastifyInstance, type FastifyReply } from 'fastify'

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

const problem = (error: CalendarError, reply: FastifyReply) =>
  reply.status(error.status).type('application/problem+json').send({
    type: `https://example.com/problems/${error.code.toLowerCase().replaceAll('_', '-')}`,
    title: error.message,
    status: error.status,
    code: error.code,
  })

const withCalendarErrors = async (handler: () => unknown, reply: FastifyReply) => {
  try {
    return await handler()
  } catch (error) {
    if (error instanceof CalendarError) return problem(error, reply)
    throw error
  }
}

export const buildApp = (service = new CalendarService()): FastifyInstance => {
  const app = Fastify({ logger: true })

  app.get('/health', async () => ({ status: 'ok' }))
  app.get('/api/health', async () => ({ status: 'ok' }))

  app.get('/api/meeting-types', async (_request, reply) =>
    withCalendarErrors(() => service.listMeetingTypes(), reply),
  )

  app.post<{ Body: MeetingTypeBody }>('/api/owner/meeting-types', async (request, reply) =>
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

  app.get<{ Params: { meetingTypeId: string } }>('/api/meeting-types/:meetingTypeId/slots', async (request, reply) =>
    withCalendarErrors(() => service.listSlots(request.params.meetingTypeId), reply),
  )

  app.post<{ Body: BookingBody }>('/api/bookings', async (request, reply) =>
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
