<script setup lang="ts">
import { CalendarCheck2, Clock3, Plus, UsersRound } from '@lucide/vue'
import { onMounted, ref } from 'vue'
import type { Booking, MeetingType } from 'calendar-api-client'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { api } from '@/lib/api'

const OWNER_TIME_ZONE = 'Europe/Moscow'

const meetingTypes = ref<MeetingType[]>([])
const bookings = ref<Booking[]>([])
const name = ref('')
const durationMinutes = ref(30)
const description = ref('')
const error = ref('')
const loading = ref(true)
const saving = ref(false)

const dateFormatter = new Intl.DateTimeFormat('ru-RU', {
  timeZone: OWNER_TIME_ZONE,
  dateStyle: 'medium',
})
const timeFormatter = new Intl.DateTimeFormat('ru-RU', {
  timeZone: OWNER_TIME_ZONE,
  timeStyle: 'short',
})

const formatBookingDate = (booking: Booking) =>
  `${dateFormatter.format(new Date(booking.startAt))} · ${timeFormatter.format(new Date(booking.startAt))}`

const loadMeetingTypes = async () => {
  error.value = ''
  loading.value = true
  try {
    const [types, upcoming] = await Promise.all([api.listMeetingTypes(), api.listOwnerBookings()])
    meetingTypes.value = [...types]
    bookings.value = [...upcoming]
  } catch {
    error.value = 'Не удалось загрузить данные админки.'
  } finally {
    loading.value = false
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
    durationMinutes.value = 30
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
  <section class="page-shell admin-page">
    <div class="container page-container">
      <div class="page-heading">
        <div>
          <p class="eyebrow">Для владельцев</p>
          <h1>Рабочая панель</h1>
          <p class="page-description">
            Создавайте форматы встреч и следите за ближайшими записями.
          </p>
        </div>
        <div class="admin-summary">
          <Badge variant="secondary"
            ><UsersRound :size="15" />{{ meetingTypes.length }} типов</Badge
          >
          <Badge variant="secondary"
            ><CalendarCheck2 :size="15" />{{ bookings.length }} записей</Badge
          >
        </div>
      </div>

      <Alert v-if="error" variant="destructive" class="mb-6">
        <AlertTitle>Что-то пошло не так</AlertTitle>
        <AlertDescription>{{ error }}</AlertDescription>
      </Alert>

      <div v-if="loading" class="loading-state" role="status">Загружаем рабочую панель…</div>
      <template v-else>
        <div class="admin-grid">
          <Card class="create-type-card">
            <CardHeader>
              <div class="card-icon"><Plus :size="18" /></div>
              <CardTitle>Новый тип встречи</CardTitle>
              <CardDescription>Гости увидят его на странице записи.</CardDescription>
            </CardHeader>
            <form class="admin-form" @submit.prevent="createMeetingType">
              <div class="form-field">
                <Label for="meeting-type-name">Название</Label>
                <Input
                  id="meeting-type-name"
                  v-model="name"
                  required
                  maxlength="100"
                  placeholder="Например, Знакомство"
                />
              </div>
              <div class="form-field">
                <Label for="meeting-type-duration"><Clock3 :size="15" />Длительность, минут</Label>
                <Input
                  id="meeting-type-duration"
                  v-model.number="durationMinutes"
                  type="number"
                  min="5"
                  step="5"
                  required
                />
                <p class="field-hint">От 5 минут, шаг 5 минут.</p>
              </div>
              <div class="form-field">
                <Label for="meeting-type-description"
                  >Описание <span class="optional-label">Необязательно</span></Label
                >
                <Textarea
                  id="meeting-type-description"
                  v-model="description"
                  rows="4"
                  maxlength="500"
                  placeholder="Что будет на встрече"
                />
              </div>
              <Button type="submit" :disabled="saving" class="w-full">
                <Plus :size="16" />
                {{ saving ? 'Сохраняем…' : 'Создать тип встречи' }}
              </Button>
            </form>
          </Card>

          <Card class="types-card">
            <CardHeader>
              <CardTitle>Типы встреч</CardTitle>
              <CardDescription>Форматы, доступные гостям прямо сейчас.</CardDescription>
            </CardHeader>
            <CardContent>
              <div
                v-if="meetingTypes.length"
                class="admin-type-list"
                aria-label="Созданные типы встреч"
              >
                <article
                  v-for="meetingType in meetingTypes"
                  :key="meetingType.id"
                  class="admin-type-item"
                >
                  <div>
                    <h2>{{ meetingType.name }}</h2>
                    <p>{{ meetingType.description || 'Без дополнительного описания' }}</p>
                  </div>
                  <Badge variant="outline"
                    ><Clock3 :size="13" />{{ meetingType.durationMinutes }} мин</Badge
                  >
                </article>
              </div>
              <Empty v-else class="empty-panel">
                <EmptyHeader>
                  <EmptyTitle>Типов встреч пока нет</EmptyTitle>
                  <EmptyDescription>Создайте первый формат с помощью формы слева.</EmptyDescription>
                </EmptyHeader>
              </Empty>
            </CardContent>
          </Card>
        </div>

        <Card class="bookings-card">
          <CardHeader>
            <CardTitle>Предстоящие записи</CardTitle>
            <CardDescription>Ближайшие встречи отсортированы по времени.</CardDescription>
          </CardHeader>
          <CardContent>
            <div v-if="bookings.length" class="table-wrapper">
              <Table aria-label="Предстоящие записи">
                <TableHeader>
                  <TableRow>
                    <TableHead>Тип встречи</TableHead>
                    <TableHead>Дата и время</TableHead>
                    <TableHead>Гость</TableHead>
                    <TableHead>Email</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow v-for="booking in bookings" :key="booking.id">
                    <TableCell class="font-medium">{{ booking.meetingType.name }}</TableCell>
                    <TableCell>{{ formatBookingDate(booking) }}</TableCell>
                    <TableCell>{{ booking.guestName }}</TableCell>
                    <TableCell>{{ booking.guestEmail }}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
            <Empty v-else class="empty-panel">
              <EmptyHeader>
                <EmptyTitle>Предстоящих записей нет</EmptyTitle>
                <EmptyDescription
                  >Когда гость выберет время, запись появится здесь.</EmptyDescription
                >
              </EmptyHeader>
            </Empty>
          </CardContent>
        </Card>
      </template>
    </div>
  </section>
</template>
