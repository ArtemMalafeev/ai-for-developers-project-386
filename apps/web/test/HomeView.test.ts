import { fireEvent, render, screen } from '@testing-library/vue'
import { nextTick } from 'vue'

import App from '@/App.vue'
import router from '@/router'

describe('главная страница', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  beforeEach(async () => {
    await router.push('/')
    await router.isReady()
  })

  it('объясняет сценарии владельца и гостя', () => {
    const { unmount } = render(App, {
      global: {
        plugins: [router],
      },
    })

    expect(
      screen.getByRole('heading', { name: 'Запись на звонок без лишних переписок' }),
    ).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Всё под контролем' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Удобное время найдено' })).toBeTruthy()
    expect(
      screen.getByText(
        'Создавайте типы встреч, настраивайте доступное время и просматривайте записи.',
      ),
    ).toBeTruthy()
    expect(
      screen.getByText(
        'Выбирайте нужный тип встречи, находите свободный слот и оставляйте данные для записи.',
      ),
    ).toBeTruthy()

    expect(screen.getByRole('link', { name: 'Записаться' }).getAttribute('href')).toBe('/booking')
    expect(screen.getByRole('link', { name: 'Админка' }).getAttribute('href')).toBe('/admin')

    unmount()
  })

  it('ведёт гостя на страницу записи', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise<Response>(() => {})),
    )
    const { unmount } = render(App, {
      global: {
        plugins: [router],
      },
    })

    await fireEvent.click(screen.getByRole('link', { name: 'Записаться на звонок' }))
    await new Promise((resolve) => setTimeout(resolve, 0))
    await nextTick()

    expect(screen.getByRole('heading', { name: 'Запись на звонок' })).toBeTruthy()
    expect(screen.getByText('Загружаем типы встреч…')).toBeTruthy()

    unmount()
  })
})
