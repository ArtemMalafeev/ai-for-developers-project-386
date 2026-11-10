import { fireEvent, render, screen } from '@testing-library/vue'

import App from '@/App.vue'
import router from '@/router'

const response = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })

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
        const url = String(input)
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
})
