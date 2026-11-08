<script setup lang="ts">
import { ArrowRight, CalendarCheck, Settings2, UsersRound } from '@lucide/vue'
import { RouterLink } from 'vue-router'
</script>

<template>
  <div class="home-page">
    <section class="hero-section">
      <div class="container hero-grid">
        <div class="hero-copy">
          <p class="eyebrow">
            <span class="eyebrow-dot" aria-hidden="true"></span>Простой календарь встреч
          </p>
          <h1>Запись на звонок без лишних переписок</h1>
          <p class="hero-description">
            Покажите свободное время, дайте гостям выбрать удобный слот и держите все записи в одном
            месте.
          </p>
          <div class="hero-actions">
            <RouterLink class="button button-primary" to="/booking">
              Записаться на звонок
              <ArrowRight :size="17" aria-hidden="true" />
            </RouterLink>
            <a class="text-link" href="#roles"
              >Как это работает <ArrowRight :size="15" aria-hidden="true"
            /></a>
          </div>
        </div>

        <div class="hero-card" aria-label="Обзор сервиса">
          <div class="hero-card-header">
            <span class="status-dot" aria-hidden="true"></span>
            <span>Ваше расписание</span>
            <span class="hero-card-date">Сегодня</span>
          </div>
          <div class="schedule-row schedule-row-muted">
            <span>10:00</span>
            <span>Командный созвон</span>
            <span class="schedule-state">Занято</span>
          </div>
          <div class="schedule-row schedule-row-active">
            <span>11:30</span>
            <span>Свободное время</span>
            <CalendarCheck :size="18" aria-hidden="true" />
          </div>
          <div class="schedule-row">
            <span>14:00</span>
            <span>Свободное время</span>
            <CalendarCheck :size="18" aria-hidden="true" />
          </div>
          <div class="hero-card-footer">
            <span>2 свободных слота</span>
            <span class="hero-card-arrow" aria-hidden="true">↗</span>
          </div>
        </div>
      </div>
    </section>

    <section id="roles" class="roles-section">
      <div class="container">
        <div class="section-heading">
          <p class="eyebrow">Для каждого участника</p>
          <h2>Один сервис — два понятных сценария</h2>
          <p>Владелец управляет расписанием, а гость быстро находит подходящее время.</p>
        </div>

        <div class="role-grid">
          <article class="role-card role-card-owner">
            <div class="role-icon" aria-hidden="true"><Settings2 :size="22" /></div>
            <div class="role-card-content">
              <p class="role-label">Для владельца</p>
              <h3>Всё под контролем</h3>
              <p>Создавайте типы встреч, настраивайте доступное время и просматривайте записи.</p>
              <ul class="role-list">
                <li>
                  <span class="list-marker" aria-hidden="true">✓</span>Типы встреч и длительность
                </li>
                <li><span class="list-marker" aria-hidden="true">✓</span>Гибкое расписание</li>
                <li><span class="list-marker" aria-hidden="true">✓</span>Список записавшихся</li>
              </ul>
            </div>
          </article>

          <article class="role-card role-card-guest">
            <div class="role-icon" aria-hidden="true"><UsersRound :size="22" /></div>
            <div class="role-card-content">
              <p class="role-label">Для гостя</p>
              <h3>Удобное время найдено</h3>
              <p>
                Выбирайте нужный тип встречи, находите свободный слот и оставляйте данные для
                записи.
              </p>
              <ul class="role-list">
                <li><span class="list-marker" aria-hidden="true">✓</span>Понятный выбор встречи</li>
                <li><span class="list-marker" aria-hidden="true">✓</span>Только свободные слоты</li>
                <li><span class="list-marker" aria-hidden="true">✓</span>Быстрая запись</li>
              </ul>
            </div>
          </article>
        </div>
      </div>
    </section>

    <section class="cta-section">
      <div class="container cta-panel">
        <div>
          <p class="eyebrow">Готовы начать?</p>
          <h2>Найдите время для важного разговора</h2>
        </div>
        <RouterLink class="button button-light" to="/booking">
          Посмотреть свободные слоты
          <ArrowRight :size="17" aria-hidden="true" />
        </RouterLink>
      </div>
    </section>
  </div>
</template>
