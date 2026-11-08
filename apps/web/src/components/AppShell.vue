<script setup lang="ts">
import { CalendarDays } from '@lucide/vue'
import { RouterLink } from 'vue-router'
</script>

<template>
  <div class="app-shell">
    <header class="site-header">
      <div class="container header-inner">
        <RouterLink class="brand" to="/" aria-label="Запись на звонок — на главную">
          <span class="brand-mark" aria-hidden="true">
            <CalendarDays :size="18" :stroke-width="2.2" />
          </span>
          <span>Запись на звонок</span>
        </RouterLink>

        <nav class="main-nav" aria-label="Основная навигация">
          <RouterLink class="nav-link" to="/booking">Записаться</RouterLink>
          <RouterLink class="nav-link nav-link-accent" to="/admin">Админка</RouterLink>
        </nav>
      </div>
    </header>

    <main>
      <slot />
    </main>

    <footer class="site-footer">
      <div class="container footer-inner">
        <span>Запись на звонок</span>
        <span>Встречи, которые начинаются вовремя.</span>
      </div>
    </footer>
  </div>
</template>
