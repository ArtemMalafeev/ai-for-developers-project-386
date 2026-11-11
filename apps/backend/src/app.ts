import { fileURLToPath } from 'node:url'
import Fastify, { type FastifyError, type FastifyInstance, type FastifyReply } from 'fastify'
import openapiGlue from 'fastify-openapi-glue'
import Ajv2020Module from 'ajv/dist/2020.js'
import addFormatsModule from 'ajv-formats'

import { CalendarError, CalendarService } from './calendar.js'
import type { RouteHandlers } from './generated/fastify.gen.js'

const specification = fileURLToPath(
  new URL('../../../packages/contracts/openapi/openapi.yaml', import.meta.url),
)

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

const withCalendarErrors = async (handler: () => void, reply: FastifyReply): Promise<void> => {
  try {
    handler()
  } catch (error) {
    if (error instanceof CalendarError) {
      problem(error, reply)
      return
    }
    throw error
  }
}

export const buildApp = (service = new CalendarService()): FastifyInstance => {
  const app = Fastify({ logger: true })
  app.addContentTypeParser(
    'application/problem+json',
    { parseAs: 'string' },
    app.getDefaultJsonParser('error', 'error'),
  )
  const validator = new Ajv2020Module.default({ allErrors: true, coerceTypes: true, strict: false })
  addFormatsModule.default(validator)
  app.setValidatorCompiler(({ schema, httpPart }) => {
    if (httpPart !== 'headers') return validator.compile(schema)
    // Node lowercases HTTP headers, while OpenAPI preserves their declared spelling.
    const headers = schema as { properties?: Record<string, unknown>; required?: string[] }
    return validator.compile({
      ...headers,
      properties: Object.fromEntries(
        Object.entries(headers.properties ?? {}).map(([name, value]) => [name.toLowerCase(), value]),
      ),
      ...(headers.required ? { required: headers.required.map((name) => name.toLowerCase()) } : {}),
    })
  })

  app.setErrorHandler((error, _request, reply) => {
    if (isValidationError(error)) {
      return problem(new CalendarError('VALIDATION_ERROR', 400, 'Request body is invalid.'), reply)
    }
    return reply.send(error)
  })

  app.get('/health', async () => ({ status: 'ok' }))
  app.get('/api/health', async () => ({ status: 'ok' }))

  const serviceHandlers = {
    listMeetingTypes: async (_request, reply) => {
      reply.code(200).send([...service.listMeetingTypes()])
    },
    listMeetingTypeSlots: async (request, reply) =>
      withCalendarErrors(() => {
        reply.code(200).send([...service.listSlots(request.params.meetingTypeId)])
      }, reply),
    listOwnerBookings: async (_request, reply) => {
      reply.code(200).send([...service.listBookings()])
    },
    createMeetingType: async (request, reply) =>
      withCalendarErrors(() => {
        const meetingType = service.createMeetingType(request.body)
        reply.status(201).send(meetingType)
      }, reply),
    createBooking: async (request, reply) =>
      withCalendarErrors(() => {
        const idempotencyKey = request.headers['idempotency-key']
        if (typeof idempotencyKey !== 'string') {
          throw new CalendarError('VALIDATION_ERROR', 400, 'Idempotency-Key is invalid.')
        }
        const booking = service.createBooking({
          ...request.body,
          idempotencyKey,
        })
        reply.status(201).send(booking)
      }, reply),
  } satisfies RouteHandlers

  app.register(openapiGlue, { specification, serviceHandlers })
  return app
}
