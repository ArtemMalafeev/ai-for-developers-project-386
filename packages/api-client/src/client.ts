/** Runtime client for the calendar API contract. */

import type {
  Booking,
  CreateBookingRequest,
  CreateMeetingTypeRequest,
  MeetingType,
  ProblemDetails,
  Slot,
} from './types.js'

export interface ApiClientOptions {
  baseUrl?: string
  fetch?: typeof globalThis.fetch
  headers?: HeadersInit
}

export interface RequestOptions {
  signal?: AbortSignal
  headers?: HeadersInit
}

export class ApiClientError extends Error {
  readonly status: number
  readonly problem?: ProblemDetails

  constructor(status: number, problem?: ProblemDetails) {
    super(problem?.detail ?? problem?.title ?? `API request failed with status ${status}`)
    this.name = 'ApiClientError'
    this.status = status
    this.problem = problem
  }
}

export interface CalendarApiClient {
  listMeetingTypes(options?: RequestOptions): Promise<MeetingType[]>
  createMeetingType(
    request: CreateMeetingTypeRequest,
    options?: RequestOptions,
  ): Promise<MeetingType>
  listMeetingTypeSlots(meetingTypeId: string, options?: RequestOptions): Promise<Slot[]>
  createBooking(
    request: CreateBookingRequest,
    idempotencyKey: string,
    options?: RequestOptions,
  ): Promise<Booking>
  listOwnerBookings(options?: RequestOptions): Promise<Booking[]>
}

const joinUrl = (baseUrl: string, path: string): string =>
  `${baseUrl.replace(/\/$/, '')}${path}`

const parseBody = async <T>(response: Response): Promise<T | undefined> => {
  if (response.status === 204) return undefined
  const text = await response.text()
  if (!text) return undefined
  return JSON.parse(text) as T
}

const mergeHeaders = (...values: Array<HeadersInit | undefined>): Headers => {
  const headers = new Headers()
  for (const value of values) {
    if (!value) continue
    new Headers(value).forEach((item, key) => headers.set(key, item))
  }
  return headers
}

export const createApiClient = (options: ApiClientOptions = {}): CalendarApiClient => {
  const baseUrl = options.baseUrl ?? ''
  const send = async <T>(
    path: string,
    init: RequestInit = {},
    requestOptions: RequestOptions = {},
  ): Promise<T> => {
    const headers = mergeHeaders(
      { accept: 'application/json' },
      init.body ? { 'content-type': 'application/json' } : undefined,
      options.headers,
      requestOptions.headers,
    )
    const request = options.fetch ?? globalThis.fetch
    const response = await request(joinUrl(baseUrl, path), {
      ...init,
      headers,
      signal: requestOptions.signal,
    })
    const body = await parseBody<T | ProblemDetails>(response)
    if (!response.ok) {
      throw new ApiClientError(response.status, body as ProblemDetails | undefined)
    }
    return body as T
  }

  return {
    listMeetingTypes: (requestOptions) => send<MeetingType[]>('/api/meeting-types', {}, requestOptions),
    createMeetingType: (body, requestOptions) =>
      send<MeetingType>(
        '/api/owner/meeting-types',
        { method: 'POST', body: JSON.stringify(body) },
        requestOptions,
      ),
    listMeetingTypeSlots: (meetingTypeId, requestOptions) =>
      send<Slot[]>(`/api/meeting-types/${encodeURIComponent(meetingTypeId)}/slots`, {}, requestOptions),
    createBooking: (body, idempotencyKey, requestOptions) =>
      send<Booking>(
        '/api/bookings',
        {
          method: 'POST',
          body: JSON.stringify(body),
          headers: { 'Idempotency-Key': idempotencyKey },
        },
        requestOptions,
      ),
    listOwnerBookings: (requestOptions) => send<Booking[]>('/api/owner/bookings', {}, requestOptions),
  }
}
