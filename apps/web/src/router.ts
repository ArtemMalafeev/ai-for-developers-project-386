import { createRouter, createWebHistory } from 'vue-router'

import HomeView from '@/views/HomeView.vue'
import PlaceholderView from '@/views/PlaceholderView.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'home',
      component: HomeView,
    },
    {
      path: '/booking',
      name: 'booking',
      component: PlaceholderView,
      props: {
        eyebrow: 'Для гостей',
        title: 'Запись на звонок',
        description:
          'Здесь появится выбор типа встречи и свободного времени. Сейчас этот раздел готовится к запуску.',
      },
    },
    {
      path: '/admin',
      name: 'admin',
      component: PlaceholderView,
      props: {
        eyebrow: 'Для владельцев',
        title: 'Админка',
        description:
          'Здесь можно будет создавать типы встреч, настраивать расписание и смотреть записи.',
      },
    },
    {
      path: '/:pathMatch(.*)*',
      redirect: '/',
    },
  ],
})

export default router
