<script setup lang="ts">
import { onMounted, ref } from 'vue'
import type { Booking, MeetingType } from 'calendar-api-client'

import { api } from '@/lib/api'

const meetingTypes = ref<MeetingType[]>([])
const bookings = ref<Booking[]>([])
const name = ref('')
const durationMinutes = ref(30)
const description = ref('')
const error = ref('')
const saving = ref(false)

const loadMeetingTypes = async () => {
  try {
    const [types, upcoming] = await Promise.all([api.listMeetingTypes(), api.listOwnerBookings()])
    meetingTypes.value = types
    bookings.value = upcoming
  } catch {
    error.value = 'Не удалось загрузить типы встреч.'
  }
}

const createMeetingType = async () => {
  saving.value = true
  error.value = ''
  try {
    const meetingType = await api.createMeetingType({
      name: name.value,
      durationMinutes: durationMinutes.value,
      ...(description.value ? { description: description.value } : {}),
    })
    meetingTypes.value.push(meetingType)
    name.value = ''
    description.value = ''
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Не удалось создать тип встречи.'
  } finally {
    saving.value = false
  }
}

onMounted(loadMeetingTypes)
</script>

<template>
  <section class="container placeholder-page admin-page">
    <p class="eyebrow">Для владельцев</p>
    <h1>Типы встреч</h1>
    <p class="placeholder-description">Создайте тип встречи, который будет доступен гостям.</p>

    <form class="meeting-type-form" @submit.prevent="createMeetingType">
      <label>Название <input v-model="name" required maxlength="100" /></label>
      <label>Длительность, минут <input v-model.number="durationMinutes" type="number" min="5" step="5" required /></label>
      <label>Описание <textarea v-model="description" rows="3" maxlength="500" /></label>
      <p v-if="error" role="alert" class="form-error">{{ error }}</p>
      <button class="button button-primary" type="submit" :disabled="saving">
        {{ saving ? 'Сохраняем…' : 'Создать тип встречи' }}
      </button>
    </form>

    <div v-if="meetingTypes.length" class="meeting-type-list" aria-label="Созданные типы встреч">
      <article v-for="meetingType in meetingTypes" :key="meetingType.id" class="meeting-type-card">
        <h2>{{ meetingType.name }}</h2>
        <p v-if="meetingType.description">{{ meetingType.description }}</p>
        <span>{{ meetingType.durationMinutes }} минут</span>
      </article>
    </div>
    <section class="booking-list" aria-label="Предстоящие записи">
      <h2>Предстоящие записи</h2>
      <p v-if="!bookings.length" class="empty-state">Предстоящих записей нет.</p>
      <ul v-else>
        <li v-for="booking in bookings" :key="booking.id">
          <strong>{{ booking.meetingType.name }}</strong>
          <span>{{ new Date(booking.startAt).toLocaleString('ru-RU', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Moscow' }) }}</span>
          <span>{{ booking.guestName }} · {{ booking.guestEmail }}</span>
        </li>
      </ul>
    </section>
  </section>
</template>
