<script setup lang="ts">
import { ArrowLeft, Clock3 } from '@lucide/vue'
import { RouterLink } from 'vue-router'

defineProps<{
  eyebrow: string
  title: string
  description: string
}>()
</script>

<template>
  <section class="placeholder-page">
    <div class="container placeholder-inner">
      <div class="placeholder-icon" aria-hidden="true"><Clock3 :size="26" /></div>
      <p class="eyebrow">{{ eyebrow }}</p>
      <h1>{{ title }}</h1>
      <p class="placeholder-description">{{ description }}</p>
      <RouterLink class="text-link text-link-back" to="/">
        <ArrowLeft :size="15" aria-hidden="true" />
        Вернуться на главную
      </RouterLink>
    </div>
  </section>
</template>
