import "@typespec/http";
import "@typespec/rest";
import "@typespec/openapi";
import "@typespec/json-schema";

using TypeSpec.Http;
using TypeSpec.Rest;
using TypeSpec.OpenAPI;
using TypeSpec.JsonSchema;

@service(#{ title: "Call Calendar API" })
@info(#{ version: "1.0.0" })
@server("http://127.0.0.1:3000", "Local API server")
@route("/api")
namespace CallCalendar;

model MeetingType {
  @minLength(1) id: string;
  @minLength(1) name: string;
  @minValue(5) @multipleOf(5) durationMinutes: int32;
  description?: string;
  ...Record<never>;
}

model CreateMeetingTypeRequest {
  @minLength(1) name: string;
  @minValue(5) @multipleOf(5) durationMinutes: int32;
  description?: string;
  ...Record<never>;
}

model Slot {
  startAt: utcDateTime;
  endAt: utcDateTime;
  ...Record<never>;
}

model MeetingTypeSnapshot {
  @minLength(1) id: string;
  @minLength(1) name: string;
  @minValue(5) @multipleOf(5) durationMinutes: int32;
  ...Record<never>;
}

model CreateBookingRequest {
  @minLength(1) meetingTypeId: string;
  startAt: utcDateTime;
  @minLength(1) guestName: string;
  @format("email") guestEmail: string;
  ...Record<never>;
}

model Booking {
  @minLength(1) id: string;
  meetingType: MeetingTypeSnapshot;
  @minLength(1) guestName: string;
  @format("email") guestEmail: string;
  startAt: utcDateTime;
  endAt: utcDateTime;
  ...Record<never>;
}

enum ProblemCode {
  VALIDATION_ERROR: "VALIDATION_ERROR",
  MEETING_TYPE_NOT_FOUND: "MEETING_TYPE_NOT_FOUND",
  MEETING_TYPE_NAME_TAKEN: "MEETING_TYPE_NAME_TAKEN",
  SLOT_UNAVAILABLE: "SLOT_UNAVAILABLE",
  IDEMPOTENCY_KEY_REUSED: "IDEMPOTENCY_KEY_REUSED",
}

model ProblemDetails {
  @format("uri-reference") type: string;
  title: string;
  status: int32;
  detail?: string;
  code: ProblemCode;
}

model ProblemResponse<Status extends int32> {
  @statusCode statusCode: Status;
  @header contentType: "application/problem+json";
  @body body: ProblemDetails;
}

model CreatedResponse<Body> {
  @statusCode statusCode: 201;
  @body body: Body;
}

@route("/meeting-types")
interface GuestMeetingTypes {
  @get @operationId("listMeetingTypes") @tag("guest")
  @summary("List meeting types")
  list(): MeetingType[];
}

@route("/meeting-types/{meetingTypeId}/slots")
interface GuestSlots {
  @get @operationId("listMeetingTypeSlots") @tag("guest")
  @summary("List available slots for the next 14 calendar days")
  list(@path @minLength(1) meetingTypeId: string): Slot[] | ProblemResponse<400> | ProblemResponse<404>;
}

@route("/bookings")
interface GuestBookings {
  @post @operationId("createBooking") @tag("guest")
  @summary("Reserve an available slot")
  create(@header("Idempotency-Key") @minLength(1) idempotencyKey: string, @body request: CreateBookingRequest):
    CreatedResponse<Booking> | ProblemResponse<400> | ProblemResponse<404> | ProblemResponse<409> | ProblemResponse<422>;
}

@route("/owner/meeting-types")
interface OwnerMeetingTypes {
  @post @operationId("createMeetingType") @tag("owner")
  @summary("Create a meeting type")
  create(@body request: CreateMeetingTypeRequest):
    CreatedResponse<MeetingType> | ProblemResponse<400> | ProblemResponse<409> | ProblemResponse<422>;
}

@route("/owner/bookings")
interface OwnerBookings {
  @get @operationId("listOwnerBookings") @tag("owner")
  @summary("List upcoming bookings")
  list(): Booking[];
}
