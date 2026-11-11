<script setup lang="ts">
import { CalendarDays, CheckCircle2, Clock3, Mail, UserRound } from '@lucide/vue'
import { CalendarDate, type DateValue } from '@internationalized/date'
import { computed, onMounted, ref, watch } from 'vue'
import {
  createBooking as createBookingRequest,
  listMeetingTypeSlots,
  listMeetingTypes,
  type MeetingType,
  type Slot,
} from 'calendar-api-client'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { responseData } from '@/lib/api'

const OWNER_TIME_ZONE = 'Europe/Moscow'

const meetingTypes = ref<MeetingType[]>([])
const loading = ref(true)
const typesError = ref('')
const selectedType = ref<MeetingType>()
const slots = ref<Slot[]>([])
const slotsLoading = ref(false)
const slotsError = ref('')
const selectedDate = ref<DateValue>()
const selectedSlot = ref<Slot>()
const guestName = ref('')
const guestEmail = ref('')
const bookingError = ref('')
const bookingConfirmation = ref('')
const bookingLoading = ref(false)
const idempotencyKey = ref('')

const dateFormatter = new Intl.DateTimeFormat('ru-RU', {
  timeZone: OWNER_TIME_ZONE,
  weekday: 'long',
  day: 'numeric',
  month: 'long',
})
const timeFormatter = new Intl.DateTimeFormat('ru-RU', {
  timeZone: OWNER_TIME_ZONE,
  hour: '2-digit',
  minute: '2-digit',
})
const datePartsFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: OWNER_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

const slotDateKey = (value: string) => {
  const parts = datePartsFormatter.formatToParts(new Date(value))
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? ''
  return `${get('year')}-${get('month')}-${get('day')}`
}

const slotDays = computed(() => {
  const grouped = new Map<string, Slot[]>()
  for (const slot of slots.value) {
    const key = slotDateKey(slot.startAt)
    const daySlots = grouped.get(key) ?? []
    daySlots.push(slot)
    grouped.set(key, daySlots)
  }

  return [...grouped.entries()]
    .sort(([first], [second]) => first.localeCompare(second))
    .map(([key, daySlots]) => {
      const [year, month, day] = key.split('-')
      return {
        key,
        date: new CalendarDate(Number(year), Number(month), Number(day)),
        slots: daySlots,
      }
    })
})

const availableDayKeys = computed(() => new Set(slotDays.value.map((day) => day.key)))
const firstAvailableDate = computed(() => slotDays.value[0]?.date)
const lastAvailableDate = computed(() => slotDays.value.at(-1)?.date)
const selectedDateKey = computed(() => selectedDate.value?.toString())
const selectedDay = computed(() => slotDays.value.find((day) => day.key === selectedDateKey.value))
const selectedDaySlots = computed(() => selectedDay.value?.slots ?? [])

const formatDate = (value: string) => dateFormatter.format(new Date(value))
const formatTime = (value: string) => timeFormatter.format(new Date(value))

const selectMeetingType = async (meetingType: MeetingType) => {
  selectedType.value = meetingType
  selectedDate.value = undefined
  selectedSlot.value = undefined
  bookingConfirmation.value = ''
  bookingError.value = ''
  slotsError.value = ''
  slotsLoading.value = true

  try {
    slots.value = [
      ...(await responseData(
        listMeetingTypeSlots({
          path: { meetingTypeId: meetingType.id },
          throwOnError: true,
        }),
      )),
    ]
    selectedDate.value = slotDays.value[0]?.date
  } catch {
    slotsError.value = 'Не удалось загрузить свободные слоты.'
    slots.value = []
  } finally {
    slotsLoading.value = false
  }
}

const isDateUnavailable = (date: DateValue) => !availableDayKeys.value.has(date.toString())

const createBooking = async () => {
  if (!selectedType.value || !selectedSlot.value) return
  bookingLoading.value = true
  bookingError.value = ''
  if (!idempotencyKey.value) idempotencyKey.value = crypto.randomUUID()

  try {
    const booking = await responseData(
      createBookingRequest({
        body: {
          meetingTypeId: selectedType.value.id,
          startAt: selectedSlot.value.startAt,
          guestName: guestName.value,
          guestEmail: guestEmail.value,
        },
        headers: { 'Idempotency-Key': idempotencyKey.value },
        throwOnError: true,
      }),
    )
    bookingConfirmation.value = `Запись подтверждена: ${booking.meetingType.name}, ${formatDate(booking.startAt)} с ${formatTime(booking.startAt)} до ${formatTime(booking.endAt)}.`
    slots.value = slots.value.filter((slot) => slot.startAt !== booking.startAt)
    selectedSlot.value = undefined
    guestName.value = ''
    guestEmail.value = ''
    idempotencyKey.value = ''
    selectedDate.value = slotDays.value[0]?.date
  } catch (cause) {
    bookingError.value = cause instanceof Error ? cause.message : 'Не удалось создать запись.'
  } finally {
    bookingLoading.value = false
  }
}

watch(selectedDate, () => {
  selectedSlot.value = undefined
  bookingError.value = ''
})

onMounted(async () => {
  try {
    meetingTypes.value = [...(await responseData(listMeetingTypes({ throwOnError: true })))]
  } catch {
    typesError.value = 'Не удалось загрузить типы встреч.'
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <section class="page-shell booking-page">
    <div class="container page-container">
      <div class="page-heading">
        <div>
          <p class="eyebrow">Для гостей</p>
          <h1>Запись на звонок</h1>
          <p class="page-description">Выберите формат встречи, день и удобное время.</p>
        </div>
        <Badge variant="secondary"><CalendarDays :size="15" />Ближайшие 14 дней</Badge>
      </div>

      <Alert v-if="typesError" variant="destructive" class="mb-6">
        <AlertTitle>Не удалось загрузить типы встреч</AlertTitle>
        <AlertDescription>{{ typesError }}</AlertDescription>
      </Alert>

      <div v-if="loading" class="loading-state" role="status">Загружаем типы встреч…</div>
      <template v-else>
        <section aria-labelledby="meeting-types-title" class="flow-section">
          <div class="section-title-row">
            <div>
              <p class="section-kicker">Шаг 1</p>
              <h2 id="meeting-types-title">Какой разговор вам нужен?</h2>
            </div>
            <span class="section-meta"
              >{{ meetingTypes.length }}
              {{ meetingTypes.length === 1 ? 'вариант' : 'варианта' }}</span
            >
          </div>

          <div v-if="meetingTypes.length" class="meeting-type-grid">
            <Card
              v-for="meetingType in meetingTypes"
              :key="meetingType.id"
              class="meeting-type-card"
              :class="{ 'meeting-type-card-selected': selectedType?.id === meetingType.id }"
            >
              <CardHeader>
                <div class="card-heading-line">
                  <CardTitle>{{ meetingType.name }}</CardTitle>
                  <Badge variant="outline"
                    ><Clock3 :size="13" />{{ meetingType.durationMinutes }} мин</Badge
                  >
                </div>
                <CardDescription>{{
                  meetingType.description || 'Индивидуальная встреча по видеосвязи.'
                }}</CardDescription>
              </CardHeader>
              <CardFooter>
                <Button
                  class="w-full"
                  :variant="selectedType?.id === meetingType.id ? 'default' : 'outline'"
                  @click="selectMeetingType(meetingType)"
                >
                  {{ selectedType?.id === meetingType.id ? 'Выбрано' : 'Выбрать время' }}
                </Button>
              </CardFooter>
            </Card>
          </div>
          <Empty v-else class="empty-panel">
            <EmptyHeader>
              <EmptyTitle>Типов встреч пока нет</EmptyTitle>
              <EmptyDescription
                >Владелец ещё не добавил доступные форматы звонков.</EmptyDescription
              >
            </EmptyHeader>
          </Empty>
        </section>

        <Alert v-if="slotsError" variant="destructive" class="mb-6">
          <AlertTitle>Не удалось загрузить свободное время</AlertTitle>
          <AlertDescription>{{ slotsError }}</AlertDescription>
        </Alert>

        <section
          v-if="selectedType"
          aria-labelledby="availability-title"
          class="flow-section availability-section"
        >
          <div class="section-title-row">
            <div>
              <p class="section-kicker">Шаг 2</p>
              <h2 id="availability-title">Выберите день и время</h2>
            </div>
            <span class="section-meta">{{ selectedType.name }}</span>
          </div>

          <div v-if="slotsLoading" class="loading-state" role="status">
            Загружаем свободные слоты…
          </div>
          <Empty v-else-if="!slots.length" class="empty-panel">
            <EmptyHeader>
              <EmptyTitle>Свободного времени пока нет</EmptyTitle>
              <EmptyDescription
                >Попробуйте выбрать другой тип встречи или зайдите позже.</EmptyDescription
              >
            </EmptyHeader>
          </Empty>
          <div v-else class="availability-grid">
            <Card class="calendar-card">
              <CardHeader>
                <CardTitle>День встречи</CardTitle>
                <CardDescription>Доступные дни отмечены в календаре.</CardDescription>
              </CardHeader>
              <CardContent>
                <Calendar
                  v-model="selectedDate"
                  :default-placeholder="firstAvailableDate"
                  :min-value="firstAvailableDate"
                  :max-value="lastAvailableDate"
                  :is-date-unavailable="isDateUnavailable"
                  locale="ru-RU"
                  class="mx-auto w-fit rounded-lg border"
                />
              </CardContent>
            </Card>

            <Card class="slots-card">
              <CardHeader>
                <CardTitle>{{
                  selectedDay
                    ? dateFormatter.format(selectedDay.date.toDate(OWNER_TIME_ZONE))
                    : 'Свободное время'
                }}</CardTitle>
                <CardDescription>Все слоты указаны по Москве.</CardDescription>
              </CardHeader>
              <CardContent>
                <div v-if="selectedDaySlots.length" class="slot-grid">
                  <Button
                    v-for="slot in selectedDaySlots"
                    :key="slot.startAt"
                    :variant="selectedSlot?.startAt === slot.startAt ? 'default' : 'outline'"
                    class="slot-button"
                    :aria-pressed="selectedSlot?.startAt === slot.startAt"
                    @click="selectedSlot = slot"
                  >
                    {{ formatTime(slot.startAt) }}
                  </Button>
                </div>
                <Empty v-else class="empty-panel">
                  <EmptyHeader>
                    <EmptyTitle>На этот день слотов нет</EmptyTitle>
                    <EmptyDescription>Выберите другой выделенный день.</EmptyDescription>
                  </EmptyHeader>
                </Empty>
              </CardContent>
            </Card>
          </div>
        </section>

        <section
          v-if="selectedSlot"
          aria-labelledby="guest-details-title"
          class="flow-section booking-details-section"
        >
          <Card class="booking-details-card">
            <CardHeader>
              <p class="section-kicker">Шаг 3</p>
              <CardTitle id="guest-details-title">Оставьте данные для записи</CardTitle>
              <CardDescription
                >{{ selectedType?.name }} · {{ formatDate(selectedSlot.startAt) }} в
                {{ formatTime(selectedSlot.startAt) }}</CardDescription
              >
            </CardHeader>
            <form class="booking-form" @submit.prevent="createBooking">
              <div class="form-grid">
                <div class="form-field">
                  <Label for="guest-name"><UserRound :size="15" />Имя</Label>
                  <Input
                    id="guest-name"
                    v-model="guestName"
                    required
                    autocomplete="name"
                    placeholder="Как к вам обращаться"
                  />
                </div>
                <div class="form-field">
                  <Label for="guest-email"><Mail :size="15" />Email</Label>
                  <Input
                    id="guest-email"
                    v-model="guestEmail"
                    required
                    type="email"
                    autocomplete="email"
                    placeholder="you@example.com"
                  />
                </div>
              </div>
              <Alert v-if="bookingError" variant="destructive">
                <AlertTitle>Не удалось создать запись</AlertTitle>
                <AlertDescription>{{ bookingError }}</AlertDescription>
              </Alert>
              <div class="form-actions">
                <Button type="submit" :disabled="bookingLoading">
                  <CheckCircle2 :size="16" />
                  {{ bookingLoading ? 'Подтверждаем…' : 'Подтвердить запись' }}
                </Button>
              </div>
            </form>
          </Card>
        </section>

        <Alert v-if="bookingConfirmation" class="success-alert" role="status">
          <CheckCircle2 :size="17" />
          <AlertTitle>{{ bookingConfirmation }}</AlertTitle>
        </Alert>
      </template>
    </div>
  </section>
</template>
