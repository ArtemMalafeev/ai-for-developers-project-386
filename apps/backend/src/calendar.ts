import { randomUUID } from 'node:crypto'

export interface MeetingType {
  readonly id: string
  readonly name: string
  readonly durationMinutes: number
  readonly description?: string
}

export interface Slot {
  readonly startAt: string
  readonly endAt: string
}

export interface MeetingTypeSnapshot {
  readonly id: string
  readonly name: string
  readonly durationMinutes: number
}

export interface Booking {
  readonly id: string
  readonly meetingType: MeetingTypeSnapshot
  readonly guestName: string
  readonly guestEmail: string
  readonly startAt: string
  readonly endAt: string
}

export type CalendarErrorCode =
  | 'VALIDATION_ERROR'
  | 'MEETING_TYPE_NOT_FOUND'
  | 'MEETING_TYPE_NAME_TAKEN'
  | 'SLOT_UNAVAILABLE'
  | 'IDEMPOTENCY_KEY_REUSED'

export class CalendarError extends Error {
  constructor(
    readonly code: CalendarErrorCode,
    readonly status: number,
    message: string,
  ) {
    super(message)
    this.name = 'CalendarError'
  }
}

export interface CalendarStore {
  addMeetingType(meetingType: MeetingType): MeetingType
  listMeetingTypes(): readonly MeetingType[]
  getMeetingType(id: string): MeetingType | undefined
  addBooking(booking: Booking, idempotencyKey: string): Booking
  listBookings(): readonly Booking[]
  findBookingByIdempotencyKey(idempotencyKey: string): Booking | undefined
}

const immutable = <T extends object>(value: T): Readonly<T> => Object.freeze(value)
const normalizeMeetingTypeName = (name: string) => name.replace(/\s+/g, '').toLocaleLowerCase('ru-RU')

export class InMemoryCalendarStore implements CalendarStore {
  private readonly meetingTypes = new Map<string, MeetingType>()
  private readonly bookings = new Map<string, Booking>()
  private readonly idempotencyKeys = new Map<string, string>()

  addMeetingType(meetingType: MeetingType): MeetingType {
    const stored = immutable({ ...meetingType })
    this.meetingTypes.set(stored.id, stored)
    return stored
  }

  listMeetingTypes(): readonly MeetingType[] {
    return Object.freeze([...this.meetingTypes.values()])
  }

  getMeetingType(id: string): MeetingType | undefined {
    return this.meetingTypes.get(id)
  }

  addBooking(booking: Booking, idempotencyKey: string): Booking {
    const stored = immutable({ ...booking, meetingType: immutable({ ...booking.meetingType }) })
    this.bookings.set(stored.id, stored)
    this.idempotencyKeys.set(idempotencyKey, stored.id)
    return stored
  }

  listBookings(): readonly Booking[] {
    return Object.freeze([...this.bookings.values()])
  }

  findBookingByIdempotencyKey(idempotencyKey: string): Booking | undefined {
    const id = this.idempotencyKeys.get(idempotencyKey)
    return id ? this.bookings.get(id) : undefined
  }
}

export interface CalendarServiceOptions {
  store?: CalendarStore
  now?: () => Date
  workingHours?: { start: number; end: number }
}

const OWNER_TIME_ZONE = 'Europe/Moscow'

const ownerParts = (value: Date) => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: OWNER_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(value)
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value)
  return { year: get('year'), month: get('month'), day: get('day'), hour: get('hour'), minute: get('minute'), second: get('second') }
}

const ownerDate = (year: number, month: number, day: number, hour: number, minute = 0) =>
  `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00+03:00`

const ownerDayStart = (value: Date) => {
  const parts = ownerParts(value)
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day))
}

const normalizeInstant = (value: string) => {
  if (!/(?:Z|[+-]\d{2}:?\d{2})$/.test(value)) return undefined
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? undefined : parsed
}

export class CalendarService {
  private readonly store: CalendarStore
  private readonly now: () => Date
  private readonly workingHours: { start: number; end: number }
  private readonly idempotencyPayloads = new Map<string, string>()

  constructor(options: CalendarServiceOptions = {}) {
    this.store = options.store ?? new InMemoryCalendarStore()
    this.now = options.now ?? (() => new Date())
    this.workingHours = options.workingHours ?? { start: 9, end: 17 }
  }

  createMeetingType(input: { name: string; durationMinutes: number; description?: string }): MeetingType {
    const name = input.name.trim()
    if (
      !name ||
      !Number.isInteger(input.durationMinutes) ||
      input.durationMinutes < 5 ||
      input.durationMinutes % 5 !== 0
    ) {
      throw new CalendarError('VALIDATION_ERROR', 422, 'Meeting type details are invalid.')
    }
    const normalizedName = normalizeMeetingTypeName(name)
    const duplicate = this.store.listMeetingTypes().some((meetingType) => normalizeMeetingTypeName(meetingType.name) === normalizedName)
    if (duplicate) {
      throw new CalendarError('MEETING_TYPE_NAME_TAKEN', 409, 'A meeting type with this name already exists.')
    }
    return this.store.addMeetingType({
      id: randomUUID(),
      name,
      durationMinutes: input.durationMinutes,
      ...(input.description?.trim() ? { description: input.description.trim() } : {}),
    })
  }

  listMeetingTypes(): readonly MeetingType[] {
    return this.store.listMeetingTypes()
  }

  getMeetingType(id: string): MeetingType {
    const meetingType = this.store.getMeetingType(id)
    if (!meetingType) throw new CalendarError('MEETING_TYPE_NOT_FOUND', 404, 'Meeting type was not found.')
    return meetingType
  }

  listSlots(meetingTypeId: string): readonly Slot[] {
    const meetingType = this.getMeetingType(meetingTypeId)
    const start = ownerDayStart(this.now())
    const slots: Slot[] = []
    const step = meetingType.durationMinutes * 60_000
    for (let day = 0; day < 14; day += 1) {
      const date = new Date(start.getTime() + day * 86_400_000)
      if (date.getUTCDay() === 0 || date.getUTCDay() === 6) continue
      const year = date.getUTCFullYear()
      const month = date.getUTCMonth() + 1
      const dayOfMonth = date.getUTCDate()
      const dayStart = new Date(ownerDate(year, month, dayOfMonth, this.workingHours.start)).getTime()
      const dayEnd = new Date(ownerDate(year, month, dayOfMonth, this.workingHours.end)).getTime()
      for (let cursor = dayStart; cursor + step <= dayEnd; cursor += step) {
        const slot = {
          startAt: new Date(cursor).toISOString(),
          endAt: new Date(cursor + step).toISOString(),
        }
        if (cursor < this.now().getTime()) continue
        if (!this.store.listBookings().some((booking) => new Date(booking.startAt).getTime() < cursor + step && new Date(booking.endAt).getTime() > cursor)) slots.push(slot)
      }
    }
    return slots
  }

  createBooking(input: {
    meetingTypeId: string
    startAt: string
    guestName: string
    guestEmail: string
    idempotencyKey: string
  }): Booking {
    const meetingType = this.getMeetingType(input.meetingTypeId)
    if (!input.idempotencyKey.trim()) throw new CalendarError('VALIDATION_ERROR', 400, 'Idempotency-Key is required.')
    const payloadFingerprint = JSON.stringify({
      meetingTypeId: input.meetingTypeId,
      startAt: input.startAt,
      guestName: input.guestName.trim(),
      guestEmail: input.guestEmail.trim().toLowerCase(),
    })
    const previous = this.store.findBookingByIdempotencyKey(input.idempotencyKey)
    if (previous) {
      if (this.idempotencyPayloads.get(input.idempotencyKey) === payloadFingerprint) return previous
      throw new CalendarError('IDEMPOTENCY_KEY_REUSED', 409, 'Idempotency key was already used.')
    }
    const start = normalizeInstant(input.startAt)
    if (!start || !input.guestName.trim() || !/^\S+@\S+\.\S+$/.test(input.guestEmail)) {
      throw new CalendarError('VALIDATION_ERROR', 400, 'Booking details are invalid.')
    }
    const end = new Date(start.getTime() + meetingType.durationMinutes * 60_000)
    const slot = this.listSlots(meetingType.id).find((candidate) => new Date(candidate.startAt).getTime() === start.getTime())
    if (!slot) {
      throw new CalendarError('SLOT_UNAVAILABLE', 409, 'The selected slot is unavailable.')
    }
    const booking = this.store.addBooking(
      {
        id: randomUUID(),
        meetingType: immutable({ id: meetingType.id, name: meetingType.name, durationMinutes: meetingType.durationMinutes }),
        guestName: input.guestName.trim(),
        guestEmail: input.guestEmail.trim(),
        startAt: start.toISOString(),
        endAt: end.toISOString(),
      },
      input.idempotencyKey,
    )
    this.idempotencyPayloads.set(input.idempotencyKey, payloadFingerprint)
    return booking
  }

  listBookings(): readonly Booking[] {
    const now = this.now().getTime()
    return Object.freeze(
      [...this.store.listBookings()]
        .filter((booking) => new Date(booking.startAt).getTime() >= now)
        .sort((left, right) => left.startAt.localeCompare(right.startAt)),
    )
  }

}
