import { render, screen } from '@testing-library/vue'

import App from '@/App.vue'
import router from '@/router'

describe('страница записи', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('показывает гостю опубликованные типы встреч', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify([{ id: 'intro', name: 'Знакомство', durationMinutes: 30 }]),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      ),
    )
    await router.push('/booking')
    await router.isReady()
    render(App, { global: { plugins: [router] } })

    expect(await screen.findByRole('heading', { name: 'Знакомство' })).toBeTruthy()
    expect(screen.getByText('30 минут')).toBeTruthy()
  })
})
