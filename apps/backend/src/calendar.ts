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

export class CalendarService {
  private readonly store: CalendarStore
  private readonly now: () => Date
  private readonly workingHours: { start: number; end: number }

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
    const duplicate = this.store
      .listMeetingTypes()
      .some((meetingType) => meetingType.name.toLocaleLowerCase() === name.toLocaleLowerCase())
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
    const start = this.startOfDay(this.now())
    const slots: Slot[] = []
    const step = meetingType.durationMinutes * 60_000
    for (let day = 0; day < 14; day += 1) {
      const date = new Date(start.getTime() + day * 86_400_000)
      if (date.getUTCDay() === 0 || date.getUTCDay() === 6) continue
      const dayStart = new Date(date)
      dayStart.setUTCHours(this.workingHours.start, 0, 0, 0)
      const dayEnd = new Date(date)
      dayEnd.setUTCHours(this.workingHours.end, 0, 0, 0)
      for (let cursor = dayStart.getTime(); cursor + step <= dayEnd.getTime(); cursor += step) {
        const slot = {
          startAt: new Date(cursor).toISOString(),
          endAt: new Date(cursor + step).toISOString(),
        }
        if (!this.store.listBookings().some((booking) => booking.startAt === slot.startAt)) slots.push(slot)
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
    const previous = this.store.findBookingByIdempotencyKey(input.idempotencyKey)
    if (previous) throw new CalendarError('IDEMPOTENCY_KEY_REUSED', 409, 'Idempotency key was already used.')
    const start = new Date(input.startAt)
    if (Number.isNaN(start.getTime()) || !input.guestName.trim() || !/^\S+@\S+\.\S+$/.test(input.guestEmail)) {
      throw new CalendarError('VALIDATION_ERROR', 400, 'Booking details are invalid.')
    }
    const end = new Date(start.getTime() + meetingType.durationMinutes * 60_000)
    const slot = this.listSlots(meetingType.id).find((candidate) => candidate.startAt === start.toISOString())
    if (!slot || this.store.listBookings().some((booking) => booking.startAt === start.toISOString())) {
      throw new CalendarError('SLOT_UNAVAILABLE', 409, 'The selected slot is unavailable.')
    }
    return this.store.addBooking(
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
  }

  listBookings(): readonly Booking[] {
    return Object.freeze([...this.store.listBookings()].sort((left, right) => left.startAt.localeCompare(right.startAt)))
  }

  private startOfDay(value: Date): Date {
    const date = new Date(value)
    date.setUTCHours(0, 0, 0, 0)
    return date
  }
}
