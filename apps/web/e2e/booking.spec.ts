import { expect, test } from '@playwright/test'

const timeFormatter = new Intl.DateTimeFormat('ru-RU', {
  timeZone: 'Europe/Moscow',
  hour: '2-digit',
  minute: '2-digit',
})

test('владелец создаёт тип встречи, гость записывается и владелец видит запись', async ({
  context,
  page: ownerPage,
}) => {
  const meetingTypeName = `E2E встреча ${Date.now()}`
  const guestName = 'Гость Playwright'
  const guestEmail = 'playwright@example.com'

  await ownerPage.goto('/admin')
  await expect(ownerPage.getByRole('heading', { name: 'Рабочая панель' })).toBeVisible()
  await ownerPage.getByLabel('Название').fill(meetingTypeName)
  await ownerPage.getByLabel('Длительность, минут').fill('30')
  await ownerPage.getByRole('button', { name: 'Создать тип встречи' }).click()
  await expect(ownerPage.getByRole('heading', { name: meetingTypeName })).toBeVisible()

  const guestPage = await context.newPage()
  await guestPage.goto('/booking')
  await expect(guestPage.getByRole('heading', { name: meetingTypeName })).toBeVisible()
  await guestPage.getByRole('button', { name: 'Выбрать время' }).click()
  await expect(guestPage.getByRole('heading', { name: 'Выберите день и время' })).toBeVisible()

  const calendar = guestPage.locator('[data-slot="calendar"]')
  await expect(calendar).toBeVisible()
  const availableDays = calendar.locator(
    '[data-slot="calendar-cell-trigger"]:not([data-disabled]):not([data-unavailable]):not([data-outside-view]):not([data-selected])',
  )
  if ((await availableDays.count()) === 0) {
    await calendar.locator('[data-slot="calendar-next-button"]').click()
  }
  const dayValue = await availableDays.first().getAttribute('data-value')
  if (!dayValue) throw new Error('Не найдена доступная дата в календаре')
  const availableDay = calendar.locator(
    `[data-slot="calendar-cell-trigger"][data-value="${dayValue}"]:not([data-outside-view])`,
  )
  await availableDay.click()
  await expect(availableDay).toHaveAttribute('data-selected', 'true')

  const slot = guestPage.locator('.slot-grid').getByRole('button').first()
  await expect(slot).toBeVisible()
  const selectedTime = (await slot.innerText()).trim()
  await slot.click()
  await guestPage.getByLabel('Имя').fill(guestName)
  await guestPage.getByLabel('Email').fill(guestEmail)
  const bookingResponsePromise = guestPage.waitForResponse(
    (response) =>
      response.url().endsWith('/api/bookings') && response.request().method() === 'POST',
  )
  await guestPage.getByRole('button', { name: 'Подтвердить запись' }).click()
  const bookingResponse = await bookingResponsePromise
  expect(bookingResponse.ok()).toBe(true)
  const bookingPayload = (await bookingResponse.json()) as { startAt: string; endAt: string }
  const expectedStartTime = timeFormatter.format(new Date(bookingPayload.startAt))
  const expectedEndTime = timeFormatter.format(new Date(bookingPayload.endAt))

  const confirmation = guestPage.getByRole('status').filter({ hasText: 'Запись подтверждена' })
  await expect(confirmation).toContainText(meetingTypeName)
  await expect(confirmation).toContainText(expectedStartTime)
  await expect(confirmation).toContainText(expectedEndTime)

  await ownerPage.reload()
  const booking = ownerPage.getByRole('table').getByRole('row').filter({ hasText: guestEmail })
  await expect(booking).toContainText(meetingTypeName)
  await expect(booking).toContainText(guestName)
  await expect(booking).toContainText(selectedTime)
})
