<script setup lang="ts">
import { onMounted, ref } from 'vue'
import type { MeetingType, Slot } from 'calendar-api-client'

import { api } from '@/lib/api'

const meetingTypes = ref<MeetingType[]>([])
const loading = ref(true)
const error = ref('')
const selectedType = ref<MeetingType>()
const slots = ref<Slot[]>([])
const slotsLoading = ref(false)
const selectedSlot = ref<Slot>()
const guestName = ref('')
const guestEmail = ref('')
const bookingError = ref('')
const bookingConfirmation = ref('')
const bookingLoading = ref(false)
const idempotencyKey = ref('')

const selectMeetingType = async (meetingType: MeetingType) => {
  selectedType.value = meetingType
  selectedSlot.value = undefined
  bookingConfirmation.value = ''
  slotsLoading.value = true
  error.value = ''
  try {
    slots.value = await api.listMeetingTypeSlots(meetingType.id)
  } catch {
    error.value = 'Не удалось загрузить свободные слоты.'
    slots.value = []
  } finally {
    slotsLoading.value = false
  }
}

const createBooking = async () => {
  if (!selectedType.value || !selectedSlot.value) return
  bookingLoading.value = true
  bookingError.value = ''
  if (!idempotencyKey.value) idempotencyKey.value = crypto.randomUUID()
  try {
    const booking = await api.createBooking(
      {
        meetingTypeId: selectedType.value.id,
        startAt: selectedSlot.value.startAt,
        guestName: guestName.value,
        guestEmail: guestEmail.value,
      },
      idempotencyKey.value,
    )
    const start = new Date(booking.startAt).toLocaleString('ru-RU', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Moscow' })
    const end = new Date(booking.endAt).toLocaleString('ru-RU', { timeStyle: 'short', timeZone: 'Europe/Moscow' })
    bookingConfirmation.value = `Запись подтверждена: ${booking.meetingType.name}, ${start}–${end}`
    slots.value = slots.value.filter((slot) => slot.startAt !== booking.startAt)
    guestName.value = ''
    guestEmail.value = ''
    idempotencyKey.value = ''
  } catch (cause) {
    bookingError.value = cause instanceof Error ? cause.message : 'Не удалось создать запись.'
  } finally {
    bookingLoading.value = false
  }
}

onMounted(async () => {
  try {
    meetingTypes.value = await api.listMeetingTypes()
  } catch {
    error.value = 'Не удалось загрузить типы встреч.'
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <section class="container placeholder-page booking-page">
    <p class="eyebrow">Для гостей</p>
    <h1>Запись на звонок</h1>
    <p v-if="loading || error" class="placeholder-description">
      Здесь появится выбор типа встречи и свободного времени. Сейчас этот раздел готовится к запуску.
    </p>
    <template v-else>
      <p class="placeholder-description">Выберите тип встречи, чтобы увидеть доступные слоты.</p>
      <div v-if="meetingTypes.length" class="meeting-type-grid" aria-label="Типы встреч">
        <article v-for="meetingType in meetingTypes" :key="meetingType.id" class="meeting-type-card">
          <h2>{{ meetingType.name }}</h2>
          <p v-if="meetingType.description">{{ meetingType.description }}</p>
          <span>{{ meetingType.durationMinutes }} минут</span>
          <button type="button" class="button button-primary" @click="selectMeetingType(meetingType)">Выбрать время</button>
        </article>
      </div>
      <p v-else class="empty-state">Владелец пока не добавил типы встреч.</p>
      <div v-if="selectedType" class="slot-panel" aria-live="polite">
        <h2>Свободное время: {{ selectedType.name }}</h2>
        <p v-if="slotsLoading">Загружаем слоты…</p>
        <p v-else-if="!slots.length" class="empty-state">Свободных слотов пока нет.</p>
        <ul v-else class="slot-list">
          <li v-for="slot in slots" :key="slot.startAt">
            <button type="button" class="button" :class="{ 'button-primary': selectedSlot?.startAt === slot.startAt }" @click="selectedSlot = slot">
              {{ new Date(slot.startAt).toLocaleString('ru-RU', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Moscow' }) }}
            </button>
          </li>
        </ul>
        <form v-if="selectedSlot" class="booking-form" @submit.prevent="createBooking">
          <label>Имя <input v-model="guestName" required autocomplete="name" /></label>
          <label>Email <input v-model="guestEmail" required type="email" autocomplete="email" /></label>
          <p v-if="bookingError" role="alert" class="form-error">{{ bookingError }}</p>
          <button class="button button-primary" type="submit" :disabled="bookingLoading">
            {{ bookingLoading ? 'Подтверждаем…' : 'Подтвердить запись' }}
          </button>
        </form>
        <p v-if="bookingConfirmation" role="status" class="success-message">{{ bookingConfirmation }}</p>
      </div>
    </template>
  </section>
</template>
