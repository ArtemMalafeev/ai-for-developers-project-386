<script setup lang="ts">
import { onMounted, ref } from 'vue'
import type { MeetingType } from '@calendar/api-client'

import { api } from '@/lib/api'

const meetingTypes = ref<MeetingType[]>([])
const loading = ref(true)
const error = ref('')

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
          <button type="button" class="button button-primary">Выбрать время</button>
        </article>
      </div>
      <p v-else class="empty-state">Владелец пока не добавил типы встреч.</p>
    </template>
  </section>
</template>
