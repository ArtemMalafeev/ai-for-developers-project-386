import "@typespec/http";
import "@typespec/rest";

using TypeSpec.Http;
using TypeSpec.Rest;

@service(#{ title: "Call Calendar API" })
@server("http://127.0.0.1:3000", "Local API server")
@route("/api")
namespace CallCalendar;

model MeetingType {
  id: string;
  name: string;
  durationMinutes: int32;
  description?: string;
}

model CreateMeetingTypeRequest {
  name: string;
  durationMinutes: int32;
  description?: string;
}

model Slot {
  startAt: utcDateTime;
  endAt: utcDateTime;
}

model MeetingTypeSnapshot {
  id: string;
  name: string;
  durationMinutes: int32;
}

model CreateBookingRequest {
  meetingTypeId: string;
  startAt: utcDateTime;
  guestName: string;
  guestEmail: string;
}

model Booking {
  id: string;
  meetingType: MeetingTypeSnapshot;
  guestName: string;
  guestEmail: string;
  startAt: utcDateTime;
  endAt: utcDateTime;
}

enum ProblemCode {
  VALIDATION_ERROR: "VALIDATION_ERROR",
  MEETING_TYPE_NOT_FOUND: "MEETING_TYPE_NOT_FOUND",
  MEETING_TYPE_NAME_TAKEN: "MEETING_TYPE_NAME_TAKEN",
  SLOT_UNAVAILABLE: "SLOT_UNAVAILABLE",
  IDEMPOTENCY_KEY_REUSED: "IDEMPOTENCY_KEY_REUSED",
}

model ProblemDetails {
  type: string;
  title: string;
  status: int32;
  detail?: string;
  code: ProblemCode;
}

@route("/meeting-types")
interface GuestMeetingTypes {
  @get
  list(): MeetingType[];
}

@route("/meeting-types/{meetingTypeId}/slots")
interface GuestSlots {
  @get
  list(@path meetingTypeId: string): Slot[] | ProblemDetails;
}

@route("/bookings")
interface GuestBookings {
  @post
  create(@header("Idempotency-Key") idempotencyKey: string, @body request: CreateBookingRequest): Booking | ProblemDetails;
}

@route("/owner/meeting-types")
interface OwnerMeetingTypes {
  @post
  create(@body request: CreateMeetingTypeRequest): MeetingType | ProblemDetails;
}

@route("/owner/bookings")
interface OwnerBookings {
  @get
  list(): Booking[];
}
