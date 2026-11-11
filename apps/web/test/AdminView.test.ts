import { fireEvent, render, screen, within } from '@testing-library/vue'

import App from '@/App.vue'
import router from '@/router'

const response = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })

const requestUrl = (input: RequestInfo | URL) =>
  input instanceof Request ? input.url : String(input)

describe('админка', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('показывает типы встреч и предстоящие записи', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) => {
        const url = requestUrl(input)
        if (url.endsWith('/api/meeting-types')) {
          return Promise.resolve(
            response([{ id: 'intro', name: 'Знакомство', durationMinutes: 30 }]),
          )
        }
        return Promise.resolve(response([]))
      }),
    )
    await router.push('/admin')
    await router.isReady()
    render(App, { global: { plugins: [router] } })

    expect(await screen.findByRole('heading', { name: 'Рабочая панель' })).toBeTruthy()
    expect(await screen.findByRole('heading', { name: 'Знакомство' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Предстоящие записи' })).toBeTruthy()
  })

  it('показывает записи разных типов в порядке ответа API', async () => {
    const bookings = [
      {
        id: 'booking-first',
        meetingType: { id: 'intro', name: 'Знакомство', durationMinutes: 30 },
        startAt: '2026-11-09T06:00:00.000Z',
        endAt: '2026-11-09T06:30:00.000Z',
        guestName: 'Первый гость',
        guestEmail: 'first@example.com',
      },
      {
        id: 'booking-second',
        meetingType: { id: 'consult', name: 'Консультация', durationMinutes: 60 },
        startAt: '2026-11-09T07:00:00.000Z',
        endAt: '2026-11-09T08:00:00.000Z',
        guestName: 'Второй гость',
        guestEmail: 'second@example.com',
      },
    ]
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) => {
        const url = requestUrl(input)
        if (url.endsWith('/api/meeting-types')) {
          return Promise.resolve(
            response([
              { id: 'intro', name: 'Знакомство', durationMinutes: 30 },
              { id: 'consult', name: 'Консультация', durationMinutes: 60 },
            ]),
          )
        }
        if (url.endsWith('/api/owner/bookings')) return Promise.resolve(response(bookings))
        return Promise.resolve(response([]))
      }),
    )
    await router.push('/admin')
    await router.isReady()
    render(App, { global: { plugins: [router] } })

    const table = await screen.findByRole('table')
    const rows = within(table).getAllByRole('row').slice(1)
    const dateFormatter = new Intl.DateTimeFormat('ru-RU', {
      timeZone: 'Europe/Moscow',
      dateStyle: 'medium',
    })
    const timeFormatter = new Intl.DateTimeFormat('ru-RU', {
      timeZone: 'Europe/Moscow',
      timeStyle: 'short',
    })
    expect(rows).toHaveLength(2)
    expect(
      rows.map((row) =>
        within(row)
          .getAllByRole('cell')
          .map((cell) => cell.textContent?.trim()),
      ),
    ).toEqual([
      [
        'Знакомство',
        `${dateFormatter.format(new Date(bookings[0].startAt))} · ${timeFormatter.format(new Date(bookings[0].startAt))}`,
        'Первый гость',
        'first@example.com',
      ],
      [
        'Консультация',
        `${dateFormatter.format(new Date(bookings[1].startAt))} · ${timeFormatter.format(new Date(bookings[1].startAt))}`,
        'Второй гость',
        'second@example.com',
      ],
    ])
  })

  it('создаёт новый тип встречи из карточки формы', async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input)
      const method = input instanceof Request ? input.method : init?.method
      if (url.includes('/api/owner/meeting-types') && method === 'POST') {
        return Promise.resolve(
          response({ id: 'consult', name: 'Консультация', durationMinutes: 45 }),
        )
      }
      if (url.endsWith('/api/meeting-types')) return Promise.resolve(response([]))
      return Promise.resolve(response([]))
    })
    vi.stubGlobal('fetch', fetchMock)
    await router.push('/admin')
    await router.isReady()
    render(App, { global: { plugins: [router] } })

    await fireEvent.update(await screen.findByLabelText('Название'), 'Консультация')
    await fireEvent.update(screen.getByLabelText('Длительность, минут'), '45')
    await fireEvent.click(screen.getByRole('button', { name: 'Создать тип встречи' }))

    expect(await screen.findByRole('heading', { name: 'Консультация' })).toBeTruthy()
    expect(
      fetchMock.mock.calls.some(
        ([input]) =>
          requestUrl(input).endsWith('/api/owner/meeting-types') &&
          input instanceof Request &&
          input.method === 'POST',
      ),
    ).toBe(true)
  })
})
