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

const selectMeetingType = async (meetingType: MeetingType) => {
  selectedType.value = meetingType
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
            {{ new Date(slot.startAt).toLocaleString('ru-RU', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Moscow' }) }}
          </li>
        </ul>
      </div>
    </template>
  </section>
</template>
