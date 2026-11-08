/** Generated from packages/contracts/openapi/openapi.yaml. Do not edit by hand. */

export type ProblemCode =
  | 'VALIDATION_ERROR'
  | 'MEETING_TYPE_NOT_FOUND'
  | 'MEETING_TYPE_NAME_TAKEN'
  | 'SLOT_UNAVAILABLE'
  | 'IDEMPOTENCY_KEY_REUSED'

export interface MeetingType {
  id: string
  name: string
  durationMinutes: number
  description?: string
}

export interface CreateMeetingTypeRequest {
  name: string
  durationMinutes: number
  description?: string
}

export interface Slot {
  startAt: string
  endAt: string
}

export interface MeetingTypeSnapshot {
  id: string
  name: string
  durationMinutes: number
}

export interface CreateBookingRequest {
  meetingTypeId: string
  startAt: string
  guestName: string
  guestEmail: string
}

export interface Booking {
  id: string
  meetingType: MeetingTypeSnapshot
  guestName: string
  guestEmail: string
  startAt: string
  endAt: string
}

export interface ProblemDetails {
  type: string
  title: string
  status: number
  detail?: string
  code: ProblemCode
}
