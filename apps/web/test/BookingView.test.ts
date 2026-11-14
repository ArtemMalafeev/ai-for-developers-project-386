import { fireEvent, render, screen } from '@testing-library/vue'

import App from '@/App.vue'
import router from '@/router'

const response = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })

const problemResponse = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/problem+json' },
  })

const requestUrl = (input: RequestInfo | URL) =>
  input instanceof Request ? input.url : String(input)

describe('страница записи', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('показывает гостю опубликованные типы встреч', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(response([{ id: 'intro', name: 'Знакомство', durationMinutes: 30 }])),
    )
    await router.push('/booking')
    await router.isReady()
    render(App, { global: { plugins: [router] } })

    expect(await screen.findByRole('heading', { name: 'Знакомство' })).toBeTruthy()
    expect(screen.getByText('30 мин')).toBeTruthy()
  })

  it('показывает календарь и слоты выбранного дня', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) => {
        const url = requestUrl(input)
        if (url.endsWith('/api/meeting-types')) {
          return Promise.resolve(
            response([{ id: 'intro', name: 'Знакомство', durationMinutes: 30 }]),
          )
        }
        return Promise.resolve(
          response([
            { startAt: '2026-11-09T06:00:00.000Z', endAt: '2026-11-09T06:30:00.000Z' },
            { startAt: '2026-11-10T07:00:00.000Z', endAt: '2026-11-10T07:30:00.000Z' },
          ]),
        )
      }),
    )
    await router.push('/booking')
    await router.isReady()
    render(App, { global: { plugins: [router] } })

    await fireEvent.click(await screen.findByRole('button', { name: 'Выбрать время' }))

    expect(await screen.findByRole('heading', { name: 'Выберите день и время' })).toBeTruthy()
    expect(await screen.findByRole('button', { name: '09:00' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: '10:00' })).toBeNull()
  })

  it('показывает ошибку, если типы встреч не загрузились', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network error')))
    await router.push('/booking')
    await router.isReady()
    render(App, { global: { plugins: [router] } })

    expect((await screen.findByRole('alert')).textContent).toContain(
      'Не удалось загрузить типы встреч',
    )
  })

  it('обновляет слоты после конфликта и сохраняет данные гостя', async () => {
    const guestName = 'Анна'
    const guestEmail = 'anna@example.com'
    const initialSlots = [
      { startAt: '2026-11-09T06:00:00.000Z', endAt: '2026-11-09T06:30:00.000Z' },
      { startAt: '2026-11-09T06:30:00.000Z', endAt: '2026-11-09T07:00:00.000Z' },
    ]
    const refreshedSlots = [initialSlots[1]]
    let slotsRequestCount = 0
    let bookingRequestCount = 0

    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) => {
        const request = input instanceof Request ? input : undefined
        const url = request?.url ?? String(input)
        if (url.endsWith('/api/meeting-types')) {
          return Promise.resolve(
            response([{ id: 'intro', name: 'Знакомство', durationMinutes: 30 }]),
          )
        }
        if (url.endsWith('/api/meeting-types/intro/slots')) {
          slotsRequestCount += 1
          return Promise.resolve(response(slotsRequestCount === 1 ? initialSlots : refreshedSlots))
        }
        if (url.endsWith('/api/bookings')) {
          bookingRequestCount += 1
          if (bookingRequestCount === 1) {
            return Promise.resolve(
              problemResponse(
                {
                  type: 'https://example.com/problems/slot-unavailable',
                  title: 'The selected slot is unavailable.',
                  status: 409,
                  code: 'SLOT_UNAVAILABLE',
                },
                409,
              ),
            )
          }
          return Promise.resolve(
            response({
              id: 'booking-1',
              meetingType: { id: 'intro', name: 'Знакомство', durationMinutes: 30 },
              guestName,
              guestEmail,
              startAt: initialSlots[1].startAt,
              endAt: initialSlots[1].endAt,
            }),
          )
        }
        return Promise.reject(new Error(`Неожиданный запрос: ${url}`))
      }),
    )
    await router.push('/booking')
    await router.isReady()
    render(App, { global: { plugins: [router] } })

    await fireEvent.click(await screen.findByRole('button', { name: 'Выбрать время' }))
    await fireEvent.click(await screen.findByRole('button', { name: '09:00' }))
    await fireEvent.update(screen.getByLabelText('Имя'), guestName)
    await fireEvent.update(screen.getByLabelText('Email'), guestEmail)
    await fireEvent.click(screen.getByRole('button', { name: 'Подтвердить запись' }))

    expect(
      await screen.findByText('Это время уже занято. Выберите другое свободное время'),
    ).toBeTruthy()
    expect(screen.queryByRole('button', { name: '09:00' })).toBeNull()
    expect(await screen.findByRole('button', { name: '09:30' })).toBeTruthy()

    await fireEvent.click(screen.getByRole('button', { name: '09:30' }))
    expect(screen.getByLabelText('Имя')).toHaveProperty('value', guestName)
    expect(screen.getByLabelText('Email')).toHaveProperty('value', guestEmail)
    expect(screen.queryByText('Это время уже занято. Выберите другое свободное время')).toBeNull()

    await fireEvent.click(screen.getByRole('button', { name: 'Подтвердить запись' }))
    expect(await screen.findByRole('heading', { name: 'Запись подтверждена' })).toBeTruthy()
    expect(screen.getByText('Встреча')).toBeTruthy()
    expect(screen.getByText('Дата')).toBeTruthy()
    expect(screen.getByText('Время')).toBeTruthy()
    expect(screen.getByText('На этот день слотов нет')).toBeTruthy()

    const selectedDay = document.querySelector(
      '[data-slot="calendar-cell-trigger"][data-value="2026-11-09"]',
    )
    expect(selectedDay?.getAttribute('data-selected')).toBe('true')
  })
})
